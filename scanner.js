// Barcode formats
import { UPC_A, UPC_E, QR_CODE } from './formats.js';
import { BarcodeDetectorPatch, NATIVE_SUPPORT, preloadRxing, preloadRxingModule, preloadRxingWasm } from './rxing.js';

export { NATIVE_SUPPORT, preloadRxing, preloadRxingModule, preloadRxingWasm };
export const DEFAULT_BARCODE_FORMATS = [UPC_A, UPC_E, QR_CODE];

/**
 * @typedef {Object} DetectedBarcode
 * @property {string} rawValue The decoded string value of the barcode.
 * @property {DOMRectReadOnly} boundingBox The bounding box of the detected barcode in the video frame.
 * @property {string} format The format of the barcode (e.g., "qr_code", "ean_13").
 * @property {number[]} [cornerPoints] Optional array of corner points (if supported).
 */


// Scanner config
export const FRAME_RATE = 12;
export const FACING_MODE = 'environment';
export const SCAN_DELAY = 1000;

// Chime config
export const CHIME_FREQUENCY = 1000;
export const CHIME_DURATION = 0.2;
export const CHIME_TYPE = 'sine';
export const CHIME_VOLUME = 0.2;

function playChime({
	frequency = CHIME_FREQUENCY,
	duration = CHIME_DURATION,
	type = CHIME_TYPE,
	volume = CHIME_VOLUME,
} = {}) {
	const ctx = new AudioContext();
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();

	osc.type = type;
	osc.frequency.setValueAtTime(frequency, ctx.currentTime);
	gain.gain.setValueAtTime(volume, ctx.currentTime);

	osc.connect(gain);
	gain.connect(ctx.destination);

	osc.start();
	osc.addEventListener('ended', () => ctx.close(), { once: true });
	osc.stop(ctx.currentTime + duration);
}

const BarcodeDetector = NATIVE_SUPPORT ? globalThis.BarcodeDetector : BarcodeDetectorPatch;

function _getConstraint(val) {
	switch (typeof val) {
		case 'object':
		case 'boolean':
			return val;

		case 'number':
		case 'string':
			return { ideal: val };
	}
}

/**
 *
 * @param {(result: DetectedBarcode) => *} callback The callback to call for scan results on detect
 * @param {object} options
 * @param {HTMLVideoElement|string|undefined} [options.video=HTMLVideoElement] The `<video>` element or ID for it, created if nothing given
 * @param {number} [options.delay=1000] The delay in milliseconds between scans
 * @param {string[]} [options.formats] An array of barcode formats to detect
 * @param {string} [options.facingMode="environment"] Front/rear facing camera
 * @param {number} [options.frameRate=12] The frame rate for the camera
 * @param {number} [options.chimeFrequency=1000] Frequency of the chime to play on detect in Hz
 * @param {number} [options.chimeDuration=0.2] Duration of the chime on detect in seconds
 * @param {OscillatorType} [options.chimeType="sine"] Shape of the audio for the chime
 * @param {number} [options.chimeVolume=0.2] Chime volume on detect
 * @param {Function} [options.errorHandler=reportError] Callback for handling errors
 * @param {DocumentOrShadowRoot} [options.base=document] Base to query for video ID if passed a string/id for a `<video>`
 * @param {DisposableStack|AsyncDisposableStack} [options.stack] Optional stack to handle disposal
 * @param {number} [options.width] Requested camera width
 * @param {number} [options.height] Requested camera height
 * @param {AbortSignal} [options.signal] Abort signal to abort the stream/video
 * @returns {Promise<{ controller: AbortController, stream: MediaStream, video: HTMLVideoElement, wakeLock: WakeLockSentinel|undefined, signal: AbortSignal }>}
 */
export async function createBarcodeScanner(callback = console.log, {
	video = document.createElement('video'),
	delay = SCAN_DELAY,
	formats = DEFAULT_BARCODE_FORMATS,
	facingMode = { ideal: FACING_MODE },
	frameRate = { ideal: FRAME_RATE },
	chimeFrequency = CHIME_FREQUENCY,
	chimeDuration = CHIME_DURATION,
	chimeType = CHIME_TYPE,
	chimeVolume = CHIME_VOLUME,
	errorHandler = reportError,
	base = document,
	stack,
	width,
	height,
	signal,
} = {}) {
	const { promise, resolve, reject } = Promise.withResolvers();

	if (typeof video === 'string') {
		return await createBarcodeScanner(callback, {
			video: base.getElementById(video),
			delay,
			formats,
			facingMode,
			frameRate,
			chimeFrequency,
			chimeDuration,
			chimeType,
			chimeVolume,
			errorHandler,
			stack,
			width,
			height,
			signal,
		});
	} else if (! (video instanceof HTMLVideoElement)) {
		reject(new TypeError(`Expected a <video> but got a ${typeof video}.`));
	} else if (signal instanceof AbortSignal && signal.aborted) {
		reject(signal.reason);
	} else if (stack?.disposed) {
		throw new DOMException('Stack was disposed.', 'AbortError');
	} else {
		let frame = NaN;

		/**
		 * @type {{ adopt: <T>(value: T, onDispose: (val: T) => void) => T, dispose: () => void }}
		*/
		const disposableStack = stack instanceof DisposableStack || stack instanceof AsyncDisposableStack
			? stack.use(new DisposableStack())
			: new DisposableStack();

		const controller = disposableStack.adopt(
			new AbortController(),
			controller => controller.abort(new DOMException('Stack disposed.', 'AbortError'))
		);

		const loadController = disposableStack.adopt(
			new AbortController(),
			controller => controller.abort(new DOMException('Stack disposed.', 'AbortError'))
		);

		const sig = signal instanceof AbortSignal
			? AbortSignal.any([signal, controller.signal])
			: controller.signal;

		const scanner = new BarcodeDetector({ formats });
		const wakeLock = 'wakeLock' in navigator
			? disposableStack.adopt(
				await navigator.wakeLock.request('screen').catch(() => undefined),
				lock => lock?.released || lock?.release()
			)
			: undefined;

		disposableStack.defer(() => {
			video.srcObject = null;
			video.cancelVideoFrameCallback(frame);
		});

		/**
		 * @type {MediaStream}
		 */
		const stream = disposableStack.adopt(await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: {
				frameRate: _getConstraint(frameRate),
				facingMode: _getConstraint(facingMode),
				width: _getConstraint(width),
				height: _getConstraint(height),
			},
		}), stream => stream.getTracks().forEach(track => track.stop()));

		const [track] = stream.getVideoTracks();

		video.srcObject = stream;

		async function drawFrame() {
			try {
				const results = await scanner.detect(video).catch(err => {
					reportError(err);
					return [];
				});

				if (results.length !== 0) {
					playChime({ frequency: chimeFrequency, duration: chimeDuration, type: chimeType, volume: chimeVolume });
					await Promise.allSettled(results.map(callback));
					await new Promise(resolve => setTimeout(resolve, delay));
				}

				if (! sig.aborted) {
					frame = video.requestVideoFrameCallback(drawFrame);
				}
			} catch(err) {
				errorHandler(err);
			}
		}

		video.addEventListener('loadedmetadata', ({ target }) => {
			const { width, height } = track.getSettings();
			target.width = width;
			target.height = height;
			resolve({ controller, video, stream, wakeLock, signal: sig, [Symbol.dispose]: disposableStack[Symbol.dispose].bind(disposableStack), stack: disposableStack });
			drawFrame();
			loadController.abort();
		}, { once: true, signal: sig });

		video.addEventListener('error', () => {
			const err = new DOMException('Error loading video stream.');
			loadController.abort(err);
			controller.abort(err);
			reject(err);
		}, { once: true, signal: sig });

		sig?.addEventListener('abort', disposableStack.dispose.bind(disposableStack), { once: true });

		video.play().catch(err => {
			reject(err);
			controller.abort(err);
			disposableStack.dispose();
		});
	}

	return promise;
}

/**
 * @deprecated
 */
export async function createBarcodeReader(...args) {
	console.warn('`createBarcodeReader` is deprecated and will be removed. It has been renamed to `createBarcodeScanner`.');
	return await createBarcodeScanner.apply(null, args);
}

export * from './formats.js';
