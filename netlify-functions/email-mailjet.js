const https = require("https")

exports.handler = function (event, context, callback) {
	// console.log("event: ", event)
	// console.log("context: ", context)
	if (event.httpMethod !== "POST") {
		callback(new Error("Unsupported http method."), null)
	}
	const requestBody = JSON.parse(event.body)
	if (requestBody["launchwolf-honeypot"]) {
		callback(
			new Error(
				"Spam protection triggered. Please do not fill out the extra email field."
			),
			null
		)
	}
	const contact = JSON.stringify({
		Properties: requestBody.properties,
		Email: requestBody.email,
		Action: "addforce",
	})

	addContact(contact, (error, data, statusCode) => {
		console.log("added: ", error, data)
		if (error) {
			callback(error, null)
		} else {
			callback(null, {
				statusCode: statusCode,
				body: data,
				headers: {
					"Access-Control-Allow-Origin": "*",
				},
			})
		}
	})
}

function addContact(contact, callback) {
	const list_ID = process.env.MAILJET_LIST_ID
	const mailjetAPIKey = process.env.MAILJET_PUBLIC_API_KEY
	const mailjetSecretKey = process.env.MAILJET_SECRET_API_KEY

	const options = {
		hostname: "api.mailjet.com",
		path: `/v3/REST/contactslist/${list_ID}/managecontact`,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization:
				"Basic " +
				Buffer.from(mailjetAPIKey + ":" + mailjetSecretKey).toString(
					"base64"
				),
		},
	}

	const request = https.request(options, (resp) => {
		let data = ""

		// A chunk of data has been recieved.
		resp.on("data", (chunk) => {
			data += chunk
		})

		// The whole response has been received.
		resp.on("end", () => {
			// console.log(JSON.parse(data).explanation)
			callback(null, data, resp.statusCode)
		})
	})

	request.on("error", (error) => {
		callback(error, null, 500)
	})

	request.write(contact)
	request.end()
}
