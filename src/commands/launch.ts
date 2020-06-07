import { Command, flags } from "@oclif/command"
import Gandi from "../domains/gandi"
import * as path from "path"
import { configValues, UnifiedConfig } from "../config/UnifiedConfig"
import cli from "cli-ux"
import chalk from "chalk"
import * as fs from "fs-extra"
import * as os from "os"
import Netlify from "../hosting/netlify"
const { Input } = require("enquirer")
import {
	getFeatureTable,
	FeatureStatus,
	getFeatureByName,
	getSingleFeatureTable,
	getStatusTable,
} from "../utils/FeatureTable"
import Mailjet from "../mailing/mailjet"

export default class Launch extends Command {
	static description = "Launches a new website."

	static generateFlagsFromConfig(cfg: any) {
		const val: any = Object.keys(cfg)
			.map((key) => {
				const value = (cfg as any)[key]
				if (!value.flag) {
					return {}
				}
				return {
					[key]: value.flag,
				}
			})
			.reduce((result, current) => {
				return Object.assign(result, current)
			})
		return val
	}

	static flags = Launch.generateFlagsFromConfig(configValues)

	static args = [{ name: "url" }]

	unifiedConfig!: UnifiedConfig
	gandi!: Gandi

	async run() {
		try {
			this.log(`Welcome to LaunchWolf!`)
			const { args, flags } = this.parse(Launch)
			this.unifiedConfig = await this.setupConfig(flags)
			this.log(
				`LaunchWolf will set up the following features for you. The end result will be a functioning, deployed website, like this one here: ${chalk.underline(
					"https://demo.launchwolf.com"
				)}`
			)
			this.log(getFeatureTable())
			const hasBeenRunOnceBefore = await this.unifiedConfig.doesGlobalConfigExist()
			if (!hasBeenRunOnceBefore) {
				this.log(
					"Since this is your first run, we need to grab some info from you to get started."
				)
			}
			const domain = await this.parseDomain(args)
			const gandiAPIKey = await this.unifiedConfig.get("gandiAPIKey")
			this.gandi = new Gandi(domain, gandiAPIKey, this.unifiedConfig)
			const isDomainOwned = await this.purchaseDomain(domain)
			const emailFeature = getFeatureByName("Email")
			emailFeature.status = FeatureStatus.inProgress
			this.log(getStatusTable())
			if (isDomainOwned) {
				await this.createMailbox(domain)
				await this.setupEmailForwarding(domain)
			} else {
				this.log(
					"Skipping Email setup since domain ownership couldn't be confirmed."
				)
			}
			emailFeature.status = FeatureStatus.done
			const hostingFeature = getFeatureByName("Hosting")
			hostingFeature.status = FeatureStatus.inProgress
			this.log(getStatusTable())

			const netlify = new Netlify(domain, this.unifiedConfig)
			await netlify.setupContinousDeployment()
			if (isDomainOwned) {
				const netlifySite = await netlify.addDomainToSite()
				const aliasAndCNAMERecordValue = `${netlifySite.name}.netlify.com.`
				await this.gandi.updateDNS(aliasAndCNAMERecordValue)
			} else {
				console.log(
					"Skipping domain and DNS setup for Netlify hosting, since domain ownership couldn't be confirmed."
				)
			}

			hostingFeature.status = FeatureStatus.done
			await this.setupMailjet(domain)
			this.log(getStatusTable())
			this.log(
				`Everything's done! After all the DNS changes propagated (can take up to 24 hours), your site will be live at: ${chalk.underline(
					"https://" + domain
				)}`
			)
			this.log(
				"If you want to deploy a new version, all you need to do is push to master (as long as you set up continous delivery with Netlify in the previous step)."
			)
		} catch (error) {
			this.handleError(error)
		}
	}

	private async setupMailjet(domain: string) {
		const mailingListFeature = getFeatureByName("Mailing list")
		mailingListFeature.status = FeatureStatus.inProgress
		console.log(getStatusTable())

		const mailjetConfig = await this.unifiedConfig.get("mailjetConfig")
		const mailjet = new Mailjet(domain, this.unifiedConfig, mailjetConfig)
		const mailjetDNSValues = await mailjet.setupDomainForSending()
		await this.gandi.setupDNSForMailjet(mailjetDNSValues)
		const contactList = await mailjet.getContactListForDomain()
		if (contactList) {
			this.log(
				`A contact list with the name ${mailingListFeature.color(
					domain
				)} already exists. You can view it here: ${mailingListFeature.color.underline(
					"https://app.mailjet.com/contacts"
				)}`
			)
		} else {
			this.log(
				`Creating a contact list with the name ${mailingListFeature.color(
					domain
				)}...`
			)
			await mailjet.createContactListForDomain()
			this.log(
				`Successfully created list with the name ${mailingListFeature.color(
					domain
				)}. You can view it here: ${mailingListFeature.color.underline(
					"https://app.mailjet.com/contacts"
				)}`
			)
		}

		this.log(
			`All you need to do now is integrate the subscription widget into the website. Unfortunately, this can't be automated, but you can easily create one at ${mailingListFeature.color.underline(
				"https://app.mailjet.com/widget"
			)}. For the next website you launch, you can just duplicate the widget and assign the duplicate to the newly created contact list.`
		)
		mailingListFeature.status = FeatureStatus.done
	}

	private async createMailbox(domain: string) {
		const emailFeature = getFeatureByName("Email")
		console.log("Next, we'll set up your email account.")
		const doesMailboxExist = await this.gandi.doesMailboxExist()
		const emailConfig = await this.unifiedConfig.get("email", {
			domain,
		})
		if (doesMailboxExist === false) {
			cli.action.start("Creating the new mailbox")
			await this.gandi.createMailbox({
				login: emailConfig.primaryEmail,
				mailbox_type: "standard",
				password: emailConfig.password,
				aliases: emailConfig.aliases,
			})
			cli.action.stop()
			console.log(
				`Mailbox successfully created. You can access it at ${emailFeature.color(
					"webmail." + domain
				)} using your email ${emailFeature.color(
					emailConfig.primaryEmail + "@" + domain
				)} and the password you entered before.`
			)
		} else {
			console.log(
				`Mailbox ${emailFeature.color(
					emailConfig.primaryEmail + "@" + domain
				)} already exists, continuing.`
			)
		}
	}

	private async setupEmailForwarding(domain: string) {
		const emailFeature = getFeatureByName("Email")
		try {
			const emailConfig = await this.unifiedConfig.get("email", {
				domain,
			})
			if (emailConfig.forwardingAddresses?.length > 0) {
				cli.action.start(
					`Setting up forwarding to ${emailFeature.color(
						emailConfig.forwardingAddresses
					)}`
				)
				await this.gandi.setupEmailForwarding(
					emailConfig.primaryEmail,
					emailConfig.forwardingAddresses
				)
				cli.action.stop()
			}
		} catch (error) {
			this.handleError(error)
			console.log(
				`Error creating email forward, skipping this step. Please set it up manually at ${emailFeature.color(
					"https://admin.gandi.net/domain"
				)}`
			)
		}
	}

	private async purchaseDomain(domain: string): Promise<boolean> {
		const domainFeature = getFeatureByName("Domain")
		domainFeature.status = FeatureStatus.inProgress
		this.log("Let's get started with purchasing your domain.")
		this.log(
			`Checking availability for domain ${domainFeature.color(domain)}...`
		)
		const gandiAPIKey = await this.unifiedConfig.get("gandiAPIKey")
		this.gandi = new Gandi(domain, gandiAPIKey, this.unifiedConfig)
		const isDomainOwned = await this.gandi.isDomainAlreadyOwned()
		domainFeature.status = FeatureStatus.done
		if (!isDomainOwned) {
			return await this.gandi.performDomainPurchaseSequence()
		} else {
			this.log(
				`Seems like you already own ${domainFeature.color(domain)}.`
			)
		}

		return true
	}

	private async setupConfig(parsedFlags: any): Promise<UnifiedConfig> {
		const localConfigPath = path.join(
			process.cwd(),
			"launchwolf-config.json"
		)
		const globalConfigPath = path.join(
			this.config.configDir,
			"launchwolf-global-config.json"
		)
		const unifiedConfig = new UnifiedConfig(
			configValues,
			parsedFlags,
			localConfigPath,
			globalConfigPath
		)
		await unifiedConfig.readConfig()
		return unifiedConfig
	}

	private async parseDomain(args: any): Promise<string> {
		let domain = args.url
		if (!domain) {
			const prompt = new Input({
				message:
					'Please enter the domain you\'d like to use for your project (for example, "youridea.com").',
			})
			const answer = await prompt.run()
			domain = answer
		}

		domain = domain.replace("https://", "")
		domain = domain.replace("http://", "")
		if (domain.slice(0, 4) === "www.") {
			domain = domain.replace("www.", "")
		}
		return domain
	}

	private handleError(error: any) {
		if (error.response) {
			// The request was made and the server responded with a status code
			// that falls out of the range of 2xx
			console.log(error.response.data)
			console.log(error.response.status)
			console.log(error.response.headers)
		} else if (error.request) {
			// The request was made but no response was received
			// `error.request` is an instance of XMLHttpRequest in the browser and an instance of
			// http.ClientRequest in node.js
			console.log(error.request)
		} else if (error.message) {
			// Something happened in setting up the request that triggered an Error
			console.log(error.message)
		} else if (error.config) {
			console.log(error.config)
		} else {
			console.log("Unknown error. ", error)
		}

		if (error.stack) {
			console.log(error.stack)
		}
		this.log(
			"An error occurred, see above for details. After fixing the problem you can safely re-run this tool to continue."
		)
	}
}
