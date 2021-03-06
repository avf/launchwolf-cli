import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios"
import { UnifiedConfig } from "../config/UnifiedConfig"
import { poll } from "../utils/poll"
const { Input, Confirm } = require("enquirer")
const domainPurchaseDryRun = false
const mailboxCreationDryRun = false
import {
	getFeatureTable,
	FeatureStatus,
	getFeatureByName,
	getSingleFeatureTable,
	Feature,
} from "../utils/FeatureTable"

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

interface Mailbox {
	id: string
	address: string
	domain: string
	mailbox_type: string
	login: string
}

interface CreateMailboxBody {
	login: string
	mailbox_type: string
	password: string
	aliases?: string[]
}

interface DNSRecord {
	rrset_name: string
	rrset_type: string
	rrset_ttl: number
	rrset_href: string
	rrset_values: string[]
}

class Gandi {
	domain: string
	axios: AxiosInstance
	unifiedConfig: UnifiedConfig
	domainsFeature: Feature

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
		this.domainsFeature = getFeatureByName("Domain")
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

	public async performDomainPurchaseSequence(): Promise<boolean> {
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
		const shouldPurchase = await this.showPurchaseConfirmationPrompt(
			domainPurchaseDurationInYears,
			price.price_after_taxes,
			domainAvailability.currency
		)
		if (!shouldPurchase) {
			console.log("Ok, aborting domain purchase.")
			return false
		}
		console.log("Great, attempting to purchase domain...")

		const domainPurchaseBody = await this.createDomainPurchaseBody(
			domainPurchaseDurationInYears,
			currency,
			price.price_after_taxes
		)
		await this.purchaseDomain(domainPurchaseBody)
		console.log(
			"Domain purchase seems to have succeeded, checking account for purchased domain to confirm payment (this may take a few tries)..."
		)
		await this.pollDomainPurchase()
		console.log("Domain purchase was successful, congratulations!")
		console.log(
			"You can view the purchased domain in the Gandi admin console at https://admin.gandi.net/domain"
		)
		return true
	}

	public async getDNSRecords(): Promise<DNSRecord[]> {
		const response = await this.axios.get(
			`/livedns/domains/${this.domain}/records`
		)

		return response.data
	}

	public async updateDNS(aliasAndCNAMERecordValue: string) {
		const records = await this.getDNSRecords()
		const promises: [string, () => Promise<any>][] = []
		if (
			records.filter(
				(elem) => elem.rrset_name === "@" && elem.rrset_type === "A"
			)[0]
		) {
			promises.push([
				"Delete A record for @ (this would conflict with ALIAS record)",
				this.createDNSDeletionPromise("@", "A"),
			])
		}

		if (
			!records.filter(
				(elem) =>
					elem.rrset_name === "@" &&
					elem.rrset_type === "ALIAS" &&
					elem.rrset_values.includes(aliasAndCNAMERecordValue)
			)[0]
		) {
			const record: DNSRecord = {
				rrset_name: "@",
				rrset_type: "ALIAS",
				rrset_ttl: 300,
				rrset_href: "",
				rrset_values: [aliasAndCNAMERecordValue],
			}
			promises.push([
				`Set ${record.rrset_type} record for ${record.rrset_name} to ${record.rrset_values}`,
				this.createDNSPutPromise(record),
			])
		}

		if (
			!records.filter(
				(elem) =>
					elem.rrset_name === "www" &&
					elem.rrset_type === "CNAME" &&
					elem.rrset_values.includes(aliasAndCNAMERecordValue)
			)[0]
		) {
			const record: DNSRecord = {
				rrset_name: "www",
				rrset_type: "CNAME",
				rrset_ttl: 300,
				rrset_href: "",
				rrset_values: [aliasAndCNAMERecordValue],
			}
			promises.push([
				`Set ${record.rrset_type} record for ${record.rrset_name} to ${record.rrset_values}`,
				this.createDNSPutPromise(record),
			])
		}
		await this.performDNSChanges(promises)
	}

	private async performDNSChanges(promises: [string, () => Promise<any>][]) {
		if (promises.length === 0) {
			console.log(
				`All DNS records set up correctly. Please wait a few hours for the changes to propagate.`
			)
			return
		}

		console.log(
			"Some DNS records are not set up correctly. Will perform the following operations:"
		)
		promises.forEach((elem) => {
			console.log("    " + elem[0])
		})
		const prompt = new Confirm({
			name: "dnsChangeQuestion",
			message: `Do you want to perform these changes (recommended)?`,
			initial: true,
		})
		const result = await prompt.run()
		if (result) {
			for (let elem of promises) {
				try {
					await elem[1]()
				} catch (error) {
					console.log("Error setting up dns record: ", error)
					throw error
				}
			}
			console.log(
				`All DNS records have been set up correctly. Please wait a few hours for the changes to propagate.`
			)
		} else {
			console.log("Ok, aborting.")
		}
	}

	private createDNSDeletionPromise(
		recordName: string,
		recordType: string
	): () => Promise<any> {
		return () =>
			this.axios.delete(
				`/livedns/domains/${this.domain}/records/${recordName}/${recordType}`
			)
	}

	private createDNSPutPromise(dnsRecord: DNSRecord): () => Promise<any> {
		return () =>
			this.axios.put(
				`/livedns/domains/${this.domain}/records/${dnsRecord.rrset_name}/${dnsRecord.rrset_type}`,
				dnsRecord
			)
	}

	private async showPurchaseConfirmationPrompt(
		domainPurchaseDurationInYears: number,
		price: number,
		currency: string
	): Promise<boolean> {
		// TODO: Add flag that skips this prompt
		const domainPurchasePrice =
			domainPurchaseDurationInYears * price + " " + currency
		const prompt = new Confirm({
			name: "purchaseQuestion",
			message: `Awesome, ${this.domainsFeature.color(
				this.domain
			)} is available! Do you want to purchase domain ${this.domainsFeature.color(
				this.domain
			)} at ${this.domainsFeature.color(
				domainPurchasePrice
			)} total for ${domainPurchaseDurationInYears} ${
				domainPurchaseDurationInYears === 1 ? "year" : "years"
			}?`,
			initial: false,
		})
		return prompt.run()
	}

	private async pollDomainPurchase() {
		const maxRetries = 10
		const delayBeforeRetryMS = 5000
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
	}

	private async createDomainPurchaseBody(
		domainPurchaseDurationInYears: number,
		currency: string,
		price: number
	): Promise<DomainPurchaseBody> {
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
				price: price,
			},
		}

		return domainPurchaseBody
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
		const response = await this.axios.get<PurchasedDomainDetails>(
			`/domain/domains/${this.domain}`
		)
		return response.data
	}

	public async doesMailboxExist(): Promise<boolean> {
		const emailConfig = await this.unifiedConfig.get("email", {
			domain: this.domain,
		})
		const mailboxes = await this.getMailboxes()
		return (
			mailboxes.filter((elem) => elem.login === emailConfig.primaryEmail)
				.length > 0
		)
	}

	public async createMailbox(mailboxBody: CreateMailboxBody): Promise<void> {
		const response = await this.axios.post(
			`/email/mailboxes/${this.domain}`,
			mailboxBody,
			{
				headers: { "Dry-Run": mailboxCreationDryRun ? "1" : "0" },
			}
		)
		const data = response.data
		if (mailboxCreationDryRun) {
			if (data?.status !== "success") {
				return Promise.reject(response.data)
			}
			return
		} else if (data?.message !== "Creation operation launched") {
			return Promise.reject(response.data)
		}
		return
	}

	public async setupEmailForwarding(
		primaryEmail: string,
		forwardingAddresses: string[]
	): Promise<void> {
		try {
			const response = await this.axios.post(
				`/email/forwards/${this.domain}`,
				{
					source: primaryEmail,
					destinations: forwardingAddresses,
				}
			)
			const data = response.data
			if (data?.message === "Forward created.") {
				return Promise.resolve()
			}

			return Promise.reject(data)
		} catch (error) {
			if (
				error?.response?.data?.errors?.[0]?.description.includes(
					"forward adress already exist"
				)
			) {
				return Promise.resolve()
			}

			return Promise.reject(error)
		}
	}

	private async getMailboxes(): Promise<Mailbox[]> {
		const response = await this.axios.get<Mailbox[]>(
			`/email/mailboxes/${this.domain}`
		)
		return response.data
	}

	public async setupDNSForMailjet(mailjetDNS: any) {
		const records = await this.getDNSRecords()
		let promises: [string, () => Promise<any>][] = []
		promises = promises.concat(
			this.createOwnershipRecordPromises(records, mailjetDNS)
		)
		promises = promises.concat(
			this.createSPFRecordPromises(records, mailjetDNS)
		)
		promises = promises.concat(
			this.createDKIMRecordPromises(records, mailjetDNS)
		)
		await this.performDNSChanges(promises)
	}

	private createOwnershipRecordPromises(
		records: DNSRecord[],
		mailjetDNS: any
	): [string, () => Promise<any>][] {
		const ownershipRecord = records.filter(
			(elem) =>
				mailjetDNS.OwnerShipTokenRecordName.includes(elem.rrset_name) &&
				elem.rrset_type === "TXT" &&
				elem.rrset_values.filter((elem) => {
					return elem.includes(mailjetDNS.OwnerShipToken)
				})[0]
		)[0]
		if (ownershipRecord) {
			return []
		}
		const record: DNSRecord = {
			rrset_name: mailjetDNS.OwnerShipTokenRecordName,
			rrset_type: "TXT",
			rrset_ttl: 300,
			rrset_href: "",
			rrset_values: [mailjetDNS.OwnerShipToken],
		}
		return [
			[
				`Set ${record.rrset_type} record for ${record.rrset_name} to ${record.rrset_values}`,
				this.createDNSPutPromise(record),
			],
		]
	}

	private createDKIMRecordPromises(
		records: DNSRecord[],
		mailjetDNS: any
	): [string, () => Promise<any>][] {
		const dkimRecord = records.filter(
			(elem) =>
				mailjetDNS.DKIMRecordName.includes(elem.rrset_name) &&
				elem.rrset_type === "TXT" &&
				elem.rrset_values.filter((elem) => {
					return elem.includes(mailjetDNS.DKIMRecordValue)
				})[0]
		)[0]
		if (dkimRecord) {
			return []
		}
		const record: DNSRecord = {
			rrset_name: mailjetDNS.DKIMRecordName,
			rrset_type: "TXT",
			rrset_ttl: 300,
			rrset_href: "",
			rrset_values: [mailjetDNS.DKIMRecordValue],
		}
		return [
			[
				`Set ${record.rrset_type} record for ${record.rrset_name} to ${record.rrset_values}`,
				this.createDNSPutPromise(record),
			],
		]
	}

	private createSPFRecordPromises(
		records: DNSRecord[],
		mailjetDNS: any
	): [string, () => Promise<any>][] {
		const spfRecord = records.filter(
			(elem) =>
				elem.rrset_name === "@" &&
				elem.rrset_type === "TXT" &&
				elem.rrset_values.filter((elem) => elem.includes("v=spf1"))[0]
		)[0]
		let newSPFValue: string | null = null
		const spfRecordOldValue = spfRecord.rrset_values.filter((elem) =>
			elem.includes("v=spf1")
		)[0]
		const mailjetSPFRecordValue: string = mailjetDNS.SPFRecordValue
		const mailjetIncludeString = mailjetSPFRecordValue
			.split(" ")
			.filter((elem) => elem.includes("include:"))[0]
		if (!spfRecord) {
			// SPF doesn't exist, let's just create it from mailjet
			newSPFValue = mailjetSPFRecordValue
		} else if (!spfRecordOldValue?.includes(mailjetIncludeString)) {
			const spfRecordOldValueSplit = spfRecordOldValue.split(" ")
			spfRecordOldValueSplit.splice(1, 0, mailjetIncludeString)
			newSPFValue = spfRecordOldValueSplit.join(" ")
		}
		if (newSPFValue) {
			const record: DNSRecord = {
				rrset_name: "@",
				rrset_type: "TXT",
				rrset_ttl: 300,
				rrset_href: "",
				rrset_values: [newSPFValue],
			}
			return [
				[
					`Set ${record.rrset_type} record for ${record.rrset_name} to ${record.rrset_values}`,
					this.createDNSPutPromise(record),
				],
			]
		}
		return []
	}
}

export default Gandi
