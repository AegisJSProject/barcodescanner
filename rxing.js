import {
	AZTEC, CODABAR, CODE_39, CODE_93, CODE_128, DATA_MATRIX, EAN_8, EAN_13, ITF, PDF417, QR_CODE, UPC_A, UPC_E,
} from './formats.js';

const NATIVE_SUPPORT = 'BarcodeDetector' in globalThis;

const { resolve, reject, promise } = Promise.withResolvers();
let loaded = false;

export const RXING_WASM_BG = 'https://unpkg.com/rxing-wasm@0.3.6/rxing_wasm_bg.js';
export const RXING_WASM = 'https://unpkg.com/rxing-wasm@0.3.6/rxing_wasm_bg.wasm';

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

let preloaded = false;

const SUPPORTED_FORMATS = Object.freeze([
	AZTEC, CODABAR, CODE_39, CODE_93, CODE_128, DATA_MATRIX, EAN_8, EAN_13, ITF, PDF417, QR_CODE, UPC_A, UPC_E,
]);

// Copied from error in Chrome
const ERR_MSG = 'Failed to execute \'detect\' on \'BarcodeDetector\': The provided value is not of type \'(Blob or HTMLCanvasElement or HTMLImageElement or HTMLVideoElement or ImageBitmap or ImageData or OffscreenCanvas or SVGImageElement or VideoFrame)\'';

export async function initializeRxing({ signal } = {}) {
	if (signal instanceof AbortSignal && signal.aborted) {
		throw signal.reason;
	} else if (! loaded) {
		try {
			const [resp, rxing_wasm_bg] = await Promise.all([
				fetch(RXING_WASM, {
					headers: { Accept: 'application/wasm' },
					referrerPolicy: 'no-referrer',
					signal,
				}),
				import(RXING_WASM_BG),
			]);

			const { instance, module } = await WebAssembly.instantiateStreaming(resp, { './rxing_wasm_bg.js': rxing_wasm_bg });
			rxing_wasm_bg.__wbg_set_wasm(instance.exports);

			resolve({ instance, module, rxing_wasm_bg });
		} catch(err) {
			reject(err);
		}
	}

	return promise;
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

	constructor({
		formats = SUPPORTED_FORMATS,
	} = {}) {

		if (! Array.isArray(formats)) {
			throw new TypeError('Invalid `formats` given to `BarcodeDetector`.');
		}

		this.#formats = formats;

		if (! preloaded) {
			Promise.try(() => {
				const link = document.createElement('link');
				link.relList.add('module-preload');
				link.crossOrigin = 'anonymous';
				link.href = RXING_WASM_BG;
				document.head.append(link);
				preloaded = true; // Avoid duplicate preloads
			});
		}
	}

	get [Symbol.toStringTag]() {
		return 'BarcodeDetector';
	}

	async detect(data) {
		if (typeof data !== 'object') {
			throw new TypeError(ERR_MSG);
		} else {

			if (! (this.#instance instanceof WebAssembly.Instance)) {
				await this.#initialize();
			}

			try {
				if (data instanceof HTMLCanvasElement || data instanceof OffscreenCanvas) {
					const ctx = data.getContext('2d');
					const imgData = ctx.getImageData(0, 0, data.width, data.height);
					const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData.data);
					const results = await this.#decode(luma8Data, data.width, data.height);

					return results;
				} else if (data instanceof ImageBitmap) {
					const canvas = new OffscreenCanvas(data.width, data.height);
					const ctx = canvas.getContext('2d');
					ctx.drawImage(data, 0, 0);
					const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData.data);
					const results = await this.#decode(luma8Data, canvas.width, canvas.height);

					return results;
				} else if (data instanceof HTMLImageElement) {
					await data.decode();
					const bitmap = await createImageBitmap(data);
					const canvas = new OffscreenCanvas(data.naturalWidth, data.naturalHeight);
					const ctx = canvas.getContext('2d');
					ctx.drawImage(bitmap, 0, 0);
					const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData);
					const results = await this.#decode(luma8Data, canvas.width, canvas.height);
					bitmap.close();

					return results;
				} else if (
					data instanceof HTMLVideoElement
					|| data instanceof Blob
					|| data instanceof SVGImageElement
					|| data instanceof ImageData
					|| ('VideoFrame' in globalThis && data instanceof globalThis.VideoFrame)
				) {
					const bitmap = await createImageBitmap(data);
					const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
					const ctx = canvas.getContext('2d');
					ctx.drawImage(bitmap, 0, 0);
					const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const luma8Data = this.#rxing_wasm_bg.convert_js_image_to_luma(imgData.data);
					const results = await this.#decode(luma8Data, canvas.width, canvas.height);
					bitmap.close();

					return results;
				} else {
					throw new TypeError(ERR_MSG);
				}
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

	/**
	 * @todo Add `boundingBox` and `cornerPoint` if possible
	 */
	#convertResults(results) {
		return results.map(result => {
			const rawValue = result.text();
			const format = DETECTOR_FORMATS[result.format()];
			const cornerPoints = result.result_points();
			result.free();
			return { rawValue, format, cornerPoints };
		});
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
