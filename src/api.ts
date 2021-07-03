/**
 * Turns a callback-based Chrome Extensions API function, e.g.:
 *
 *     chrome.storage.sync.set(something, (returnValue) => {...})
 *
 * ... and makes it into a Promise which resolves to the `returnValue`.
 */
export function api<T, P extends CallableProps<T>>(object: T, fn: P, ...fnArgs: ParametersWithoutCallback<T[P]>) {
    return new Promise<CallbackValue<T[P]>>((resolve, reject) => {
        const cb = (cbArg: CallbackValue<T[P]>) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError)
            } else {
                resolve(cbArg)
            }
        }
        object[fn](...fnArgs, cb)
    })
}

type CallableProps<T> = { [P in keyof T]: T[P] extends Function ? P : never }[keyof T]

/**
 * Takes a tuple, strips the last element, and returns the rest.
 */
type Head<T> = T extends [...infer U, any] ? U : never

/**
 * Takes a tuple, and returns the last element, but only if it's a function.
 */
type LastIfFunction<T> = T extends [...any, infer U] ? (U extends Function ? U : never) : never

type AnyFunction = (...args: any) => any

/**
 * Takes a function with a callback as its last param, and returns the type of
 * that callback.
 */
type CallbackType<T extends AnyFunction> = LastIfFunction<Required<Parameters<T>>>

/**
 * Takes a function with a callback as its last param, and returns the type of
 * the value delivered to that callback.
 */
type CallbackValue<T extends AnyFunction> = Parameters<CallbackType<T>>[0]

/**
 * Takes a function with a callback as its last param, and returns a tuple with
 * every param of that function except for the callback.
 */
type ParametersWithoutCallback<T extends AnyFunction> = Head<Required<Parameters<T>>>
