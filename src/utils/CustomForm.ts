const { Form } = require("enquirer")

// This form implements slightly better UX. When pressing Enter, the Form will not submit, but instead move to the next line. Only after all lines have been entered, will the form submit.
export class CustomForm extends Form {
	constructor(arg: any) {
		super(arg)
	}
	async submit() {
		if (this.index === this.choices.length - 1) {
			return super.submit()
		}

		this.next()
		return null
	}
}
