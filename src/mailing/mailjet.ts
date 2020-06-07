import * as path from "path"
import chalk from "chalk"
import * as fs from "fs-extra"
import * as os from "os"
import { UnifiedConfig } from "../config/UnifiedConfig"
import {
	getFeatureTable,
	FeatureStatus,
	getFeatureByName,
	getSingleFeatureTable,
	Feature,
} from "../utils/FeatureTable"
let mailjetImport = require("node-mailjet")

const MAILJET_API_VERSION = "v3"

class Mailjet {
	domain: string
	unifiedConfig: UnifiedConfig
	mailingFeature: Feature
	mailjet: any

	public constructor(
		domain: string,
		unifiedConfig: UnifiedConfig,
		mailjetConfig: any
	) {
		this.domain = domain
		this.unifiedConfig = unifiedConfig
		this.mailingFeature = getFeatureByName("Mailing list")
		this.mailjet = mailjetImport.connect(
			mailjetConfig.publicAPIKey,
			mailjetConfig.privateAPIKey
		)
	}

	public async getDNS() {
		const response = await this.mailjet
			.get("dns", { version: MAILJET_API_VERSION })
			.request()
		const sender = response.body?.Data?.filter(
			(elem: any) => elem.Domain === this.domain
		)?.[0]
		return sender
	}

	public async setupDomainForSending() {
		let dns = await this.getDNS()
		if (dns) {
			console.log("Domain is already registered with Mailjet.")
			return dns
		}

		const postResponse = await this.mailjet
			.post("sender", { version: MAILJET_API_VERSION })
			.request({
				EmailType: "bulk",
				Name: this.domain,
				Email: `*@${this.domain}`,
			})
		const newlyCreatedSender = postResponse.body?.Data?.filter(
			(elem: any) => elem.Name === this.domain
		)?.[0]
		if (!newlyCreatedSender) {
			throw new Error(`Error creating sender: ${postResponse}`)
		}
		dns = await this.getDNS()
		if (!dns) {
			throw new Error(`Error creating sender: ${postResponse}`)
		}
		console.log(
			"Successfully added domain to Mailjet. You can review it here: https://app.mailjet.com/account/sender"
		)
		return dns
	}

	public async getContactLists() {
		const response = await this.mailjet
			.get("contactslist", { version: MAILJET_API_VERSION })
			.request()
		return response.body
	}

	public async getContactListForDomain() {
		const contactLists = await this.getContactLists()
		const contactList = contactLists.Data?.filter(
			(elem: any) => elem.Name === this.domain
		)?.[0]
		return contactList
	}

	public async createContactListForDomain() {
		const response = await this.mailjet
			.post("contactslist", { version: MAILJET_API_VERSION })
			.request({
				Name: this.domain,
			})
		if (response.body?.Data?.[0]?.Name != this.domain) {
			throw new Error(response.body)
		}
	}
}

export default Mailjet
