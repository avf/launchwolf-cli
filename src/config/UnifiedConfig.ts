import { flags } from "@oclif/command"
import * as fs from "fs-extra"
import { CustomForm } from "../utils/CustomForm"
import chalk from "chalk"
import cli from "cli-ux"
import * as os from "os"
import * as path from "path"
const NetlifyAPI = require("netlify")

const {
	Password,
	Confirm,
	AutoComplete,
	Select,
	Snippet,
	List,
} = require("enquirer")
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
			const domain = promptArgs.domain
			const prompt = new Snippet({
				name: "email",
				message: "What should your primary email address be?",
				required: true,
				template: `\${primaryEmail}@${domain}`,
			})

			const primaryEmailResult = await prompt.run()
			const primaryEmail = primaryEmailResult.values.primaryEmail
			const passwordPrompt = new Password({
				name: "emailPassword",
				message:
					"Please create a password for the new email account. Must be at least 8 characters long and less than 200, have at least one lower char, one upper char, one digit and one special char.",
			})
			const password = await passwordPrompt.run()
			const listPrompt = new List({
				name: "aliases",
				message: `You can also set up email aliases. Type your aliases here as a comma-separated list.\nFor example, you can set up:\n${chalk.green(
					"support"
				)}@${domain}\n${chalk.green(
					"hello"
				)}@${domain}\nTo do this, type:\n ${chalk.green(
					"support, hello"
				)}\nOr, just press return to skip setting up aliases.`,
			})
			let aliases = await listPrompt.run()
			aliases = aliases.map((elem: any) => elem.replace(`@${domain}`, ""))

			const forwardingPrompt = new List({
				name: "forwardingAddresses",
				message: `You can also set up email forwarding to existing addresses. Type your existing email addresses here, as a comma-separated list.\nFor example:\n${chalk.green(
					"yourname@gmail.com, yourname@otherdomain.com"
				)}\nOr, just press return to skip setting up forwarding addresses.`,
			})
			let forwardingAddresses = await forwardingPrompt.run()
			return {
				primaryEmail,
				password,
				aliases,
				forwardingAddresses,
			}
		},
	},
	netlifyAccessToken: {
		prompt: async () => {
			try {
				const netlifyConfigPath = path.join(
					os.homedir(),
					".netlify",
					"config.json"
				)
				const netlifyConfig = await fs.readJSON(netlifyConfigPath)
				const userId = netlifyConfig.userId
				const tokenFromConfig =
					netlifyConfig.users?.[userId]?.auth?.token
				return tokenFromConfig
			} catch (error) {
				// Failed reading from netlify config. Launching browser to authenticate.
				const clientId =
					"8274a33a0f170e39f1683fc5998aed42d59d6740e598af80e177085d6117dbe5"
				const netlifyAPI = new NetlifyAPI()
				const ticket = await netlifyAPI.createTicket({
					clientId: clientId,
				})
				// Open browser for authentication
				await cli.open(
					`https://app.netlify.com/authorize?response_type=ticket&ticket=${ticket.id}`
				)
				// API is also set up to use the returned access token as a side effect
				// Save this for later so you can quickly set up an authenticated client
				const accessToken = await netlifyAPI.getAccessToken(ticket)
				return accessToken
			}
		},
	},
	mailjetConfig: {
		prompt: async () => {
			console.log(
				"We need your Mailjet Public API and Secret Key. You can create them here: https://app.mailjet.com/account/api_keys"
			)
			const passwordPrompt = new Password({
				name: "mailjetPublicKey",
				message: "Please enter the Mailjet (public) API Key.",
			})
			const mailjetPublicKey = await passwordPrompt.run()
			const passwordPromptPrivate = new Password({
				name: "mailjetPrivateKey",
				message: "Please enter the Mailjet Secret Key.",
			})
			const mailjetPrivateKey = await passwordPromptPrivate.run()
			return {
				publicAPIKey: mailjetPublicKey,
				privateAPIKey: mailjetPrivateKey,
			}
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
		if (await this.doesLocalConfigExist()) {
			console.log(
				`Using local config at ${chalk.cyan(this.localConfigPath)}`
			)
			this.localConfig = await fs.readJSON(this.localConfigPath)
		}
		if (await this.doesGlobalConfigExist()) {
			console.log(
				`Using global config at ${chalk.cyan(
					this.globalConfigPath
				)}. Local config values at ${chalk.cyan(
					this.localConfigPath
				)} are preferred when present.`
			)
			this.globalConfig = await fs.readJSON(this.globalConfigPath)
		}
	}

	public async doesLocalConfigExist(): Promise<boolean> {
		return await fs.pathExists(this.localConfigPath)
	}

	public async doesGlobalConfigExist(): Promise<boolean> {
		return await fs.pathExists(this.globalConfigPath)
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
		} else if (this.possibleKeys[key].defaultValue !== undefined) {
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
