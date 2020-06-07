const logSymbols = require("log-symbols")
const Table = require("cli-table")
import chalk, { Chalk } from "chalk"

export enum FeatureStatus {
	pending,
	inProgress,
	done,
	failed,
}

export interface Feature {
	feature: string
	provider: string
	price: string
	description: string
	status: FeatureStatus
	color: Chalk
}

function getFeatureStatusString(status: FeatureStatus): string {
	switch (status) {
		case FeatureStatus.pending:
			return "Pending"
			break
		case FeatureStatus.inProgress:
			return "In Progress"
			break
		case FeatureStatus.done:
			return "Done " + logSymbols.success
			break
		case FeatureStatus.failed:
			return "Failed " + logSymbols.error
	}
}

export let features: Feature[] = [
	{
		feature: "Domain",
		provider: "gandi.net",
		price: "Price of Domain",
		description: "Purchase a new domain",
		status: FeatureStatus.inProgress,
		color: chalk.magentaBright,
	},
	{
		feature: "Email",
		provider: "gandi.net",
		price: "Free with Domain",
		description: "Setup inbox + forwarding",
		status: FeatureStatus.pending,
		color: chalk.blueBright,
	},
	{
		feature: "Hosting",
		provider: "netlify.com",
		price: "Free",
		description: "Static webhosting + DNS Setup + SSL",
		status: FeatureStatus.pending,
		color: chalk.cyanBright,
	},
	{
		feature: "Mailing list",
		provider: "mailjet.com",
		price: "Free",
		description: "Email subscription box",
		status: FeatureStatus.pending,
		color: chalk.yellowBright,
	},
]

export function getFeatureByName(name: string): Feature {
	return features.filter((elem) => elem.feature === name)[0]
}

export function getFeatureTable(): string {
	const table = new Table({
		head: [
			"Feature",
			"Provider",
			"Pricing",
			"Description",
			"Status",
		].map((elem) => chalk.reset.bold.underline(elem)),
	})
	for (const feature of features) {
		table.push(getFeatureTableRow(feature))
	}
	return table.toString()
}

export function getStatusTable(): string {
	const table = new Table({
		head: ["Feature", "Status"].map((elem) =>
			chalk.reset.bold.underline(elem)
		),
	})
	for (const feature of features) {
		table.push(getStatusTableRow(feature))
	}
	return table.toString()
}

export function getSingleFeatureTable(feature: Feature) {
	const table = new Table({
		head: ["Feature", "Status"].map((elem) =>
			chalk.reset.bold.underline(elem)
		),
	})
	table.push(getStatusTableRow(feature))
	return table.toString()
}

function getStatusTableRow(feature: Feature) {
	return [
		feature.feature,
		getFeatureStatusString(feature.status),
	].map((elem) => feature.color(elem))
}

function getFeatureTableRow(feature: Feature): any {
	return [
		feature.feature,
		feature.provider,
		feature.price,
		feature.description,
		getFeatureStatusString(feature.status),
	].map((elem) => feature.color(elem))
}
