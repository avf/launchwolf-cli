export async function poll<T>(
	functionToPoll: () => Promise<T>,
	successCondition: (result: T) => boolean,
	errorToThrow: Error,
	delayBeforeRetryInMilliseconds: number,
	maximumRetryCount: number,
	uponRetry?: (currentAttempt: number) => void
): Promise<T> {
	let currentAttempt = 0
	let result = await functionToPoll()
	while (
		!successCondition(result) &&
		currentAttempt < maximumRetryCount - 1
	) {
		currentAttempt++
		if (uponRetry) {
			uponRetry(currentAttempt)
		}
		await wait(delayBeforeRetryInMilliseconds)
		result = await functionToPoll()
	}

	if (!successCondition(result)) {
		return Promise.reject(errorToThrow)
	}
	return result
}

function wait(milliseconds: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds)
	})
}
