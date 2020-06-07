import { Command, flags } from "@oclif/command"
import Gandi from "../domains/gandi"
import * as path from "path"
import { configValues, UnifiedConfig } from "../config/UnifiedConfig"
import cli from "cli-ux"
import chalk from "chalk"

const { Input } = require("enquirer")

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
			this.log("Welcome to LaunchWolf!")
			const { args, flags } = this.parse(Launch)
			this.unifiedConfig = await this.setupConfig(flags)
			const domain = await this.parseDomain(args)
			const gandiAPIKey = await this.unifiedConfig.get("gandiAPIKey")
			this.gandi = new Gandi(domain, gandiAPIKey, this.unifiedConfig)
			await this.purchaseDomain(domain)
			await this.createMailbox(domain)
			await this.setupEmailForwarding(domain)
		} catch (error) {
			this.handleError(error)
		}
	}

	private async createMailbox(domain: string) {
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
				`Mailbox successfully created. You can access it at ${chalk.green(
					"webmail." + domain
				)} using your email ${chalk.cyan(
					emailConfig.primaryEmail + "@" + domain
				)} and the password you entered before.`
			)
		} else {
			console.log(
				`Mailbox ${chalk.cyan(
					emailConfig.primaryEmail + "@" + domain
				)} already exists, continuing.`
			)
		}
	}

	private async setupEmailForwarding(domain: string) {
		const emailConfig = await this.unifiedConfig.get("email", {
			domain,
		})
		if (emailConfig.forwardingAddresses?.length > 0) {
			cli.action.start(
				`Setting up forwarding to ${chalk.cyan(
					emailConfig.forwardingAddresses
				)}`
			)
			await this.gandi.setupEmailForwarding(
				emailConfig.primaryEmail,
				emailConfig.forwardingAddresses
			)
			cli.action.stop()
		}
	}

	private async purchaseDomain(domain: string) {
		this.log(`Checking availability for domain "${domain}"...`)
		const gandiAPIKey = await this.unifiedConfig.get("gandiAPIKey")
		this.gandi = new Gandi(domain, gandiAPIKey, this.unifiedConfig)
		const isDomainOwned = await this.gandi.isDomainAlreadyOwned()
		if (!isDomainOwned) {
			await this.gandi.performDomainPurchaseSequence()
		} else {
			this.log(`Seems like you already own \"${domain}\".`)
		}
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
