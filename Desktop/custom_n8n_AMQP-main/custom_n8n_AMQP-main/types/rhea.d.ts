declare module 'rhea' {
	export interface ConnectionOptions {
		// add only what you need, or just use `any` for now
		[key: string]: any;
	}
	export interface EventContext {
		[key: string]: any;
	}
	export interface Message {
		[key: string]: any;
	}
	export interface ReceiverOptions {
		[key: string]: any;
	}
	export interface Sender {
		[key: string]: any;
	}
	export interface Connection {
		[key: string]: any;
	}
	export function create_container(...args: any[]): any;
	export type Dictionary<T = any> = { [key: string]: T };
}