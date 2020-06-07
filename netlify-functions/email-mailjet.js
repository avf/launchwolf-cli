const https = require("https")

exports.handler = function (event, context, callback) {
	// console.log("event: ", event)
	// console.log("context: ", context)
	if (event.httpMethod !== "POST") {
		callback(new Error("Unsupported http method."), null)
	}
	const requestBody = JSON.parse(event.body)
	if (requestBody.honeypot) {
		callback(
			new Error(
				"Spam protection triggered. Please do not fill out the extra email field."
			)
		)
	}
	const contact = JSON.stringify({
		Properties: requestBody.properties,
		Email: requestBody.email,
		Action: "addforce",
	})

	addContact(contact, (error, data) => {
		callback(error, { statusCode: 200, body: data })
	})
}

function addContact(contact, callback) {
	const list_ID = ""
	const mailjetAPIKey = process.env.MAILJET_PUBLIC_API_KEY
	const mailjetSecretKey = process.env.MAILJET_SECRET_API_KEY

	const options = {
		hostname: "api.mailjet.com",
		path: `/v3/REST/contactslist/${list_ID}/managecontact`,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// "Content-Length": data.length,
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
			callback(null, data)
		})
	})

	request.on("error", (error) => {
		callback(error, null)
	})

	request.write(contact)
	request.end()
}
