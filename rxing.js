import {
	AZTEC, CODABAR, CODE_39, CODE_93, CODE_128, DATA_MATRIX, EAN_8, EAN_13, ITF, PDF417, QR_CODE, UPC_A, UPC_E,
} from './formats.js';

export const NATIVE_SUPPORT = 'BarcodeDetector' in globalThis;
export const RXING_WASM_BG = 'https://unpkg.com/rxing-wasm@0.5.4/rxing_wasm_bg.js';
export const RXING_WASM = 'https://unpkg.com/rxing-wasm@0.5.4/rxing_wasm_bg.wasm';
export const RXING_WASM_INTEGRITY = 'sha384-sd8mSCh3JzmpRFV4gSfa3yTyStxW5ZCUOCh3/GhJFoEAsAM4n/3DUtE3KDB52Iwy';
export const RXING_WASM_BG_INTEGRITY = 'sha384-QUw4nsvmaWo3esMUiPmECoS3agKYY4W9qp0dSp+nI+IsIuzUlnTX5Yjgb41oHebo';

const { resolve, reject, promise } = Promise.withResolvers();
let loaded = false;
let preloadedWasm = false;
let preloadedModule = false;

const RXING_FORMATS = Object.freeze({
	[AZTEC]: 'AZTEC',
	[CODABAR]: 'CODABAR',
	[CODE_39]: 'Code39',
	[CODE_93]: 'Code93',
	[CODE_128]: 'Code128',
	[DATA_MATRIX]: 'DataMatrix',
	[EAN_8]: 'Ean8',
	[EAN_13]: 'Ean13',
	[ITF]: 'ITF',
	[PDF417]: 'Pdf417',
	[QR_CODE]: 'QrCode',
	[UPC_A]: 'UpcA',
	[UPC_E]: 'UpcE',
});

const DETECTOR_FORMATS = Object.freeze([
	AZTEC,
	CODABAR,
	CODE_39,
	CODE_93,
	CODE_128,
	DATA_MATRIX,
	EAN_8,
	EAN_13,
	ITF,
	'MAXICODE', // Unsupported
	PDF417,
	QR_CODE,
	'Rss14', // Unsupported
	'RssExpanded', // Unsupported
	UPC_A,
	UPC_E,
]);

const SUPPORTED_FORMATS = Object.freeze([
	AZTEC, CODABAR, CODE_39, CODE_93, CODE_128, DATA_MATRIX, EAN_8, EAN_13, ITF, PDF417, QR_CODE, UPC_A, UPC_E,
]);

// Copied from error in Chrome
const ERR_MSG = 'Failed to execute \'detect\' on \'BarcodeDetector\': The provided value is not of type \'(Blob or HTMLCanvasElement or HTMLImageElement or HTMLVideoElement or ImageBitmap or ImageData or OffscreenCanvas or SVGImageElement or VideoFrame)\'';

async function _preload(href, {
	rel,
	fetchPriority = 'high',
	referrerPolicy = 'no-referrer',
	integrity,
	as,
	type,
	signal,
} = {}) {
	const { resolve, reject, promise } = Promise.withResolvers();

	if (signal instanceof AbortSignal && signal.aborted) {
		reject(signal.reason);
	} else {
		const link = document.createElement('link');
		const controller = new AbortController();
		const sig = signal instanceof AbortSignal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

		const load = ({ target }) => {
			resolve(target);
			controller.abort();
			preloadedModule = true;
		};

		const error = ({ target }) => {
			const err =  target instanceof AbortSignal ? target.reason : new DOMException(`Error preloading ${target.href}`, 'NetworkError');
			reject(err);
			controller.abort(err);
		};

		link.relList.add(rel);
		link.crossOrigin = 'anonymous';
		link.referrerPolicy = referrerPolicy;
		link.fetchPriority = fetchPriority;
		link.addEventListener('load', load, { once: true, signal: sig });
		link.addEventListener('error', error, { once: true, signal: sig });

		if (typeof as === 'string') {
			link.as = as;
		}

		if (type === 'string') {
			link.type = type;
		}

		if (typeof integrity === 'string') {
			link.integrity = integrity;
		}

		link.href = href;
		document.head.append(link);

		if (signal instanceof AbortSignal) {
			signal.addEventListener('abort', error, { once: true, signal: controller.signal });
		}
	}

	return promise;
}
export async function preloadRxingModule({ signal, referrerPolicy = 'no-referrer', fetchPriority = 'high' } = {}) {
	if (! NATIVE_SUPPORT && ! preloadedModule) {
		const result = await _preload(RXING_WASM_BG, {
			rel: 'modulepreload',
			integrity: RXING_WASM_BG_INTEGRITY,
			referrerPolicy,
			fetchPriority,
			signal,
		});

		preloadedModule = true;
		return result;
	}
}

export async function preloadRxingWasm({ signal, referrerPolicy = 'no-referrer', fetchPriority = 'high' } = {}) {
	if (! NATIVE_SUPPORT && ! preloadedWasm) {
		const result = await _preload(RXING_WASM, {
			rel: 'preload',
			as: 'fetch',
			type: 'application/wasm',
			integrity: RXING_WASM_INTEGRITY,
			referrerPolicy,
			fetchPriority,
			signal,
		});

		preloadedWasm = true;
		return result;
	}
}

export async function preloadRxing({ signal, referrerPolicy = 'no-referrer', fetchPriority = 'high' } = {}) {
	return await Promise.all([
		preloadRxingModule({ signal, referrerPolicy, fetchPriority }),
		preloadRxingWasm({ signal, referrerPolicy, fetchPriority }),
	]);
}

export async function initializeRxing({ signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (! loaded) {
		try {
			const [resp, rxing_wasm_bg] = await Promise.all([
				fetch(RXING_WASM, {
					headers: { Accept: 'application/wasm' },
					referrerPolicy: 'no-referrer',
					integrity: RXING_WASM_INTEGRITY,
					signal,
				}),
				import(RXING_WASM_BG),
			]);

			const { instance, module } = await WebAssembly.instantiateStreaming(resp, { './rxing_wasm_bg.js': rxing_wasm_bg });
			rxing_wasm_bg.__wbg_set_wasm(instance.exports);

			resolve({ instance, module, rxing_wasm_bg });
			loaded = true;
		} catch(err) {
			loaded = true;
			reject(err);
		}
	}

	return promise;
}

export class DetectedBarcode {
	#rawValue;
	#format;
	#boundingBox;
	#cornerPoints;

	constructor(result) {
		this.#rawValue = result.text();
		this.#format = DETECTOR_FORMATS[result.format()];
		this.#cornerPoints = result.result_points();

		result.free();
	}

	get rawValue() {
		return this.#rawValue;
	}

	get format() {
		return this.#format;
	}

	/**
	 * @todo Add `boundingBox` and `cornerPoint` if possible
	 */
	get boundingBox() {
		return this.#boundingBox;
	}

	get cornerPoints() {
		return this.#cornerPoints;
	}
}

export class BarcodeDetectorPatch {
	/**
	 * @type WebAssembly.Instance
	 */
	#instance;

	/**
	 * @type WebAssembly.Module
	 */
	// #module;

	#formats = [];

	/**
	 * @type module
	 */
	#rxing_wasm_bg;

	/**
	 * @type string
	 */
	#hints = '';

	/**
	 * Avoids re-creating on every frame and heavy GC
	 * @type {OffscreenCanvas}
	 */
	#canvas = new OffscreenCanvas(0, 0);

	/**
	 * @type {OffscreenCanvasRenderingContext2D}
	 */
	#ctx;

	constructor({
		formats = SUPPORTED_FORMATS,
	} = {}) {

		if (! Array.isArray(formats)) {
			throw new TypeError('Invalid `formats` given to `BarcodeDetector`.');
		}

		this.#formats = formats;
		this.#ctx = this.#canvas.getContext('2d', { willReadFrequently: true });
	}

	get [Symbol.toStringTag]() {
		return 'BarcodeDetector';
	}

	async detect(data) {
		if (typeof data !== 'object') {
			throw new TypeError(ERR_MSG);
		} else {

			if (! (this.#instance instanceof WebAssembly.Instance)) {
				await scheduler.postTask(this.#initialize.bind(this), { priority: 'background' });
			}

			try {
				return await scheduler.postTask(async () => {
					if (data instanceof HTMLCanvasElement || data instanceof OffscreenCanvas) {
						const ctx = data.getContext('2d');
						const imgData = ctx.getImageData(0, 0, data.width, data.height);
						const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData.data);
						const results = await this.#decode(luma8Data, data.width, data.height);

						return results;
					} else if (data instanceof ImageBitmap) {
						// Do not close the bitmap which may be wanted elsewhere
						return await this.#setBitmap(data, { close: false });
					} else if (data instanceof HTMLImageElement) {
						await data.decode();
						const bitmap = await createImageBitmap(data);

						return await this.#setBitmap(bitmap);
					} else if (
						data instanceof HTMLVideoElement
						|| data instanceof Blob
						|| data instanceof SVGImageElement
						|| data instanceof ImageData
						|| ('VideoFrame' in globalThis && data instanceof globalThis.VideoFrame)
					) {
						const bitmap = await createImageBitmap(data);
						return await this.#setBitmap(bitmap);
					} else {
						throw new TypeError(ERR_MSG);
					}
				}, {
					priority: 'user-visible',
				});
			} catch {
				return [];
			}
		}
	}

	async #initialize({ signal } = {}) {
		if (! (this.#instance instanceof WebAssembly.Instance)) {
			const { instance, rxing_wasm_bg } = await initializeRxing({ signal });
			this.#instance = instance;
			// this.#module = module;
			this.#rxing_wasm_bg = rxing_wasm_bg;
			this.#hints = new rxing_wasm_bg.DecodeHintDictionary();
			this.#hints.set_hint(
				rxing_wasm_bg.DecodeHintTypes.PossibleFormats,
				this.#formats.map(format => RXING_FORMATS[format]).join(',')
			);
		}
	}

	async #decode(luma8Data, width, height) {
		try {
			const results = this.#rxing_wasm_bg.decode_multi(luma8Data, width, height, this.#hints);

			return this.#convertResults(results);
		} catch {
			return [];
		}
	}

	#convertResults(results) {
		return results.map(result => new DetectedBarcode(result));
	}

	/**
	 *
	 * @param {ImageBitmap} bitmap
	 */
	async #setBitmap(bitmap, { close = true } = {}) {
		if (bitmap.width !== this.#canvas.width) {
			this.#canvas.width = bitmap.width;
		}

		if (bitmap.height !== this.#canvas.height) {
			this.#canvas.height = bitmap.height;
		}

		this.#ctx.drawImage(bitmap, 0, 0);
		const imgData = this.#ctx.getImageData(0, 0, this.#canvas.width, this.#canvas.height);
		const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData.data);
		const results = await this.#decode(luma8Data, this.#canvas.width, this.#canvas.height);

		if (close) {
			bitmap.close();
		}

		return results;
	}

	static async getSupportedFormats() {
		return SUPPORTED_FORMATS;
	}
}

export function patchBarcodeDetector() {
	if (! NATIVE_SUPPORT && ! loaded) {
		globalThis.patchBarcodeDetector = BarcodeDetectorPatch;
		return true;
	} else {
		return false;
	}
}
