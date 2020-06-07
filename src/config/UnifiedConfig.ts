import { flags } from "@oclif/command"
import * as fs from "fs-extra"
import { CustomForm } from "../utils/CustomForm"
const { Password, Confirm, AutoComplete, Select, Snippet } = require("enquirer")
const countries = require("./countries.json")
const domainPurchaseCurrencyOptions = ["EUR", "USD", "GBP", "TWD", "CNY"]

// TODO: Add config version
export const configValues = {
	gandiAPIKey: {
		flag: flags.string({
			description:
				"API key for gandi.net. You can find instructions on how to create one here: https://github.com/avf/launchwolf-cli#domains",
		}),
		prompt: () => {
			const prompt = new Password({
				message:
					"Please enter the API key for gandi.net. You can find instructions on how to create one here: https://github.com/avf/launchwolf-cli#domains",
			})
			return prompt.run()
		},
	},
	domainPurchaseCurrency: {
		flag: flags.string({
			description: "Preferred currency for new domain purchases.",
			options: domainPurchaseCurrencyOptions,
		}),
		prompt: () => {
			const typePrompt = new Select({
				name: "domainPurchaseCurrency",
				message:
					"Select your preferred currency for new domains. We'll store it and use it to check prices and for new purchases.",
				choices: domainPurchaseCurrencyOptions.slice(),
			})
			return typePrompt.run()
		},
	},
	domainOwner: {
		prompt: async () => {
			let confirmed = false
			let result = null
			do {
				const prompt = new CustomForm({
					name: "domainOwner",
					message:
						"Please provide the following info for registering the domain. WHOIS privacy will be enabled by default, so this information will not be made public, but it will be sent to the domain registrar.",
					choices: [
						{
							name: "firstName",
							message: "First Name",
							initial: "John",
						},
						{
							name: "lastName",
							message: "Last Name",
							initial: "Doe",
						},
						{
							name: "streetAddress",
							message: "Street",
							initial: "123 Sunset Blvd",
						},
						{
							name: "city",
							message: "City",
							initial: "Los Angeles",
						},
						{ name: "zip", message: "Zip Code", initial: "90210" },
						{
							name: "phone",
							message: "Phone Number",
							initial: "+11234567",
						},
						{
							name: "email",
							message: "Email Address",
							initial: "yourname@example.com",
						},
					],
				})
				result = await prompt.run()
				const countryISOCodes = Object.keys(countries)
				const countryNames = countryISOCodes.map(
					(key) => countries[key]
				)
				const countriesPrompt = new AutoComplete({
					name: "domainOwnerCountry",
					message: "Start typing to select your country.",
					limit: 4,
					choices: countryNames,
				})
				const chosenCountry = await countriesPrompt.run()
				result.countryISO = countryISOCodes.filter(
					(key) => countries[key] === chosenCountry
				)[0]
				const domainOwnerTypes = [
					"Person",
					"Company",
					"Association",
					"Public body",
					"Domain Reseller",
				]
				const typePrompt = new Select({
					name: "domainOwnerType",
					message: "Which describes you best?",
					choices: domainOwnerTypes.slice(),
				})
				const domainOwnerTypeName = await typePrompt.run()
				const domainOwnerTypeNumber = domainOwnerTypes.findIndex(
					(el) => el === domainOwnerTypeName
				)
				result.domainOwnerTypeNumeric = domainOwnerTypeNumber
				const confirmPrompt = new Confirm({
					name: "domainOwnerConfirm",
					message: `Is this information correct?\n${JSON.stringify(
						result,
						null,
						4
					)}`,
					initial: true,
				})
				confirmed = await confirmPrompt.run()
			} while (!confirmed)

			return Promise.resolve(result)
		},
	},
	domainPurchaseDurationInYears: {
		flag: flags.integer({
			description: "Payment duration for new domains, in years. ",
			default: 1,
		}),
	},
	email: {
		prompt: async (promptArgs: any) => {
			const prompt = new Snippet({
				name: "email",
				message: "What should your primary email address be?",
				required: true,
				template: `\${primaryEmail}@${promptArgs.domain}`,
			})

			const primaryEmailResult = await prompt.run()
			const primaryEmail = primaryEmailResult.values.primaryEmail
			return primaryEmail
		},
	},
}

export class UnifiedConfig {
	possibleKeys: any
	parsedFlags: any
	localConfig: any = {}
	globalConfig: any = {}
	localConfigPath: string
	globalConfigPath: string

	constructor(
		possibleKeys: any,
		parsedFlags: any,
		localConfigPath: string,
		globalConfigPath: string
	) {
		this.possibleKeys = possibleKeys
		this.parsedFlags = parsedFlags
		this.localConfigPath = localConfigPath
		this.globalConfigPath = globalConfigPath
	}

	public async readConfig() {
		if (await fs.pathExists(this.localConfigPath)) {
			this.localConfig = await fs.readJSON(this.localConfigPath)
		}
		if (await fs.pathExists(this.globalConfigPath)) {
			this.globalConfig = await fs.readJSON(this.globalConfigPath)
		}
	}

	// Attempts to read config value from command line flags.
	// If not present, attempts to read from local config file.
	// If not present, attempts to read from global config file.
	// If not present, shows a prompt. The value is then saved in the global/local config.
	public async get(key: string, promptArgs?: any): Promise<any> {
		if (this.parsedFlags[key]) {
			return Promise.resolve(this.parsedFlags[key])
		} else if (this.localConfig[key]) {
			return Promise.resolve(this.localConfig[key])
		} else if (this.globalConfig[key]) {
			return Promise.resolve(this.globalConfig[key])
		} else if (this.possibleKeys[key].prompt) {
			let resultFromPrompt = null
			do {
				resultFromPrompt = await this.possibleKeys[key].prompt(
					promptArgs
				)
				if (!resultFromPrompt) {
					console.log("You entered an invalid value.")
				}
			} while (!resultFromPrompt)
			// TODO: Add check here to validate the input before saving. For example, for API keys, perform a quick GET request to some endpoint.
			await this.save(key, resultFromPrompt)
			return resultFromPrompt
		} else if (this.possibleKeys[key].defaultValue) {
			return Promise.resolve(this.possibleKeys[key].defaultValue)
		}

		return Promise.reject("Couldn't find config key " + key)
	}

	public async save(key: string, value: any) {
		const shouldSaveToLocalConfig = this.possibleKeys[key]
			.shouldSaveToLocalConfig
		console.log(
			`Saving value as "${key}" in ${
				shouldSaveToLocalConfig ? "local" : "global"
			} config file, which is stored at ${
				shouldSaveToLocalConfig
					? this.localConfigPath
					: this.globalConfigPath
			}`
		)

		if (shouldSaveToLocalConfig) {
			this.localConfig[key] = value
			this.writeConfigAt(this.localConfigPath, this.localConfig)
		} else {
			this.globalConfig[key] = value
			this.writeConfigAt(this.globalConfigPath, this.globalConfig)
		}
	}

	public async writeConfigAt(path: string, value: any) {
		await fs.ensureFile(path)
		await fs.writeJSON(path, value, { spaces: "\t" })
	}
}
