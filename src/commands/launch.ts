import { Command, flags } from "@oclif/command"
import Gandi from "../domains/gandi"
import * as path from "path"
import { configValues, UnifiedConfig } from "../config/UnifiedConfig"
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

	async run() {
		try {
			const { args, flags } = this.parse(Launch)
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
				flags,
				localConfigPath,
				globalConfigPath
			)
			await unifiedConfig.readConfig()
			this.log("Welcome to LaunchWolf!")
			let domain = args.url
			if (!domain) {
				const prompt = new Input({
					message:
						'Please enter the domain you\'d like to use for your project (for example, "youridea.com").',
				})
				const answer = await prompt.run()
				domain = answer
			}
			// TODO: Check if domain has correct format, remove http/https
			this.log(`Checking availability for domain "${domain}"...`)
			const gandiAPIKey = await unifiedConfig.get("gandiAPIKey")
			const gandi = new Gandi(domain, gandiAPIKey, unifiedConfig)
			const isDomainOwned = await gandi.isDomainAlreadyOwned()
			if (!isDomainOwned) {
				await gandi.performDomainPurchaseSequence()
			} else {
				this.log(`Seems like you already own \"${domain}\".`)
			}
		} catch (error) {
			this.handleError(error)
		}
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
		this.log(
			"An error occurred, see above for details. After fixing the problem you can safely re-run this tool to continue."
		)
	}
}
