import * as path from "path"
import chalk from "chalk"
import * as fs from "fs-extra"
import * as os from "os"
import { UnifiedConfig } from "../config/UnifiedConfig"
const NetlifyAPI = require("netlify")
const NetlifyCLIInit = require("netlify-cli/src/commands/init.js")

class Netlify {
	domain: string
	unifiedConfig: UnifiedConfig

	public constructor(domain: string, unifiedConfig: UnifiedConfig) {
		this.domain = domain
		this.unifiedConfig = unifiedConfig
	}

	public async setupContinousDeployment() {
		const netlifySiteId = await this.readLocalNetlifySiteId()
		if (netlifySiteId) {
			console.log(
				`Seems like ${chalk.greenBright(
					"continuous deployment"
				)} with ${chalk.greenBright(
					"Netlify"
				)} has already been set up. Anything you ${chalk.greenBright(
					"push"
				)} to ${chalk.greenBright(
					"master"
				)} branch should automatically be deployed.`
			)
			return
		}

		console.log(
			"Will now set up continous deployment with Netlify. Please follow the instructions from Netlify CLI."
		)
		await NetlifyCLIInit.run([])
		console.log(
			`${chalk.greenBright(
				"Continuous deployment"
			)} was set up successfully! Anything you ${chalk.greenBright(
				"push"
			)} to ${chalk.greenBright(
				"master"
			)} branch will automatically be deployed.`
		)
	}

	public async addDomainToSite() {
		const netlifyAccessToken = await this.unifiedConfig.get(
			"netlifyAccessToken"
		)
		const netlifyAPI = new NetlifyAPI(netlifyAccessToken)
		const siteId = await this.readLocalNetlifySiteId()
		const site = await netlifyAPI.getSite({ siteId: siteId })
		if (site.custom_domain === this.domain) {
			return site
		}
		const updatedSite = await netlifyAPI.updateSite({
			siteId: siteId,
			body: { custom_domain: this.domain, ssl: true },
		})
		return updatedSite
	}

	private async readLocalNetlifySiteId() {
		const netlifyJSONPath = path.join(
			process.cwd(),
			".netlify",
			"state.json"
		)
		const netlifyJSON = await fs.readJSON(netlifyJSONPath)
		const netlifySiteId = netlifyJSON.siteId
		return netlifySiteId
	}
}

export default Netlify
