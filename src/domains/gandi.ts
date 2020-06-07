import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios"
import { UnifiedConfig } from "../config/UnifiedConfig"
import { poll } from "../utils/poll"
const { Input, Confirm } = require("enquirer")
const domainPurchaseDryRun = false

interface PurchasedDomainDetails {
	status: string[]
}

interface DomainOwner {
	country: string
	email: string
	family: string
	given: string
	streetaddr: string
	city: string
	zip: string
	phone: string
	type: number // 0=person, 1=company, 2=association, 3=public body, 4=reseller
	currency?: string
	price?: number
}

interface DomainPurchaseBody {
	fqdn: string
	duration: number
	owner: DomainOwner
}

class Gandi {
	domain: string
	axios: AxiosInstance
	unifiedConfig: UnifiedConfig

	public constructor(
		domain: string,
		apiKey: string,
		unifiedConfig: UnifiedConfig
	) {
		this.domain = domain
		this.axios = axios.create({
			baseURL: "https://api.gandi.net/v5",
			headers: {
				Authorization: `Apikey ${apiKey}`,
			},
		})
		this.unifiedConfig = unifiedConfig
	}

	public async isDomainAlreadyOwned(): Promise<boolean> {
		try {
			const domainDetails = await this.getDomainInfo()
			// TODO: This needs a more robust check
			if (domainDetails.status[0] === "clientTransferProhibited") {
				return true
			}
			return false
		} catch (error) {
			// If status code is 404, we treat it as valid response (= Domain not owned).
			// Otherwise we re-throw the error
			if (error?.response?.status === 404) {
				return false
			}
			throw error
		}
	}

	public async performDomainPurchaseSequence() {
		const currency = await this.unifiedConfig.get("domainPurchaseCurrency")
		const domainAvailability = await this.checkAvailability(currency)
		const product = domainAvailability?.products?.filter(
			(elem: any) => elem.process === "create"
		)[0]
		const price = product?.prices?.filter(
			(elem: any) => elem.duration_unit === "y"
		)[0]
		if (
			product?.status !== "available" ||
			!price ||
			domainAvailability?.currency !== currency
		) {
			throw new Error("Unfortunately, this domain is unavailable.")
		}
		const domainPurchaseDurationInYears = await this.unifiedConfig.get(
			"domainPurchaseDurationInYears"
		)
		// TODO: Add flag that skips this prompt
		const prompt = new Confirm({
			name: "purchaseQuestion",
			message: `Do you want to purchase domain "${this.domain}" at ${
				domainPurchaseDurationInYears * price.price_after_taxes
			}${
				domainAvailability.currency
			} total for ${domainPurchaseDurationInYears} ${
				domainPurchaseDurationInYears === 1 ? "year" : "years"
			}?`,
			initial: false,
		})
		const shouldPurchase = await prompt.run()
		if (!shouldPurchase) {
			console.log(
				"Ok, aborting domain purchase. Continuing with the next step."
			)
			return
		}
		console.log("Great, attempting to purchase domain...")
		const domainOwner = await this.unifiedConfig.get("domainOwner")
		const domainPurchaseBody: DomainPurchaseBody = {
			fqdn: this.domain,
			duration: domainPurchaseDurationInYears,
			owner: {
				country: domainOwner.countryISO,
				email: domainOwner.email,
				family: domainOwner.lastName,
				given: domainOwner.firstName,
				streetaddr: domainOwner.streetAddress,
				city: domainOwner.city,
				zip: domainOwner.zip,
				phone: domainOwner.phone,
				type: domainOwner.domainOwnerTypeNumeric,
				currency: currency,
				price: price.price_after_taxes,
			},
		}
		const maxRetries = 10
		const delayBeforeRetryMS = 5000
		await this.purchaseDomain(domainPurchaseBody)
		console.log(
			"Domain purchase seems to have succeeded, checking account for purchased domain to confirm payment (this may take a few tries)..."
		)
		await poll(
			this.isDomainAlreadyOwned.bind(this),
			(result) => result,
			new Error(
				"Couldn't confirm domain purchase. Please review the domain purchase in the Gandi admin console. It should be in the orders tab at: https://admin.gandi.net/billing"
			),
			delayBeforeRetryMS,
			maxRetries,
			(currentAttempt) => {
				console.log(
					`Attempt ${currentAttempt}/${maxRetries} failed, retrying in ${
						delayBeforeRetryMS / 1000
					}s...`
				)
			}
		)
		console.log("Domain purchase was successful, congratulations!")
		console.log(
			"You can view the purchased domain in the Gandi admin console at https://admin.gandi.net/domain"
		)
	}

	private async purchaseDomain(purchaseBody: DomainPurchaseBody) {
		const response = await this.axios.post(
			`/domain/domains`,
			purchaseBody,
			{
				headers: { "Dry-Run": domainPurchaseDryRun ? "1" : "0" },
			}
		)
		const data = response.data
		if (domainPurchaseDryRun) {
			if (data?.status !== "success") {
				return Promise.reject(response.data)
			}
			return
		} else if (data?.message !== "Creation operation launched") {
			return Promise.reject(response.data)
		}
		return
	}

	public async checkAvailability(currency: string) {
		const response = await this.axios.get(
			`/domain/check?name=${this.domain}&processes=create&currency=${currency}`
		)

		return response.data
	}

	private async getDomainInfo(): Promise<PurchasedDomainDetails> {
		// TODO: error handling for bad API key
		const response = await this.axios.get<PurchasedDomainDetails>(
			`/domain/domains/${this.domain}`
		)
		return response.data
	}
}

export default Gandi
