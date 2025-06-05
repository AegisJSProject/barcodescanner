// Barcode formats
import { UPC_A, QR_CODE } from './formats.js';
import { BarcodeDetectorPatch } from './rxing.js';

export const NATIVE_SUPPORT = 'BarcodeDetector' in globalThis;

export const DEFAULT_BARCODE_FORMATS = [UPC_A, QR_CODE];

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
	osc.frequency.setValueAtTime(frequency, ctx.currentTime); // 1kHz ding
	gain.gain.setValueAtTime(volume, ctx.currentTime); // Adjust volume

	osc.connect(gain);
	gain.connect(ctx.destination);

	osc.start();
	osc.stop(ctx.currentTime + duration); // Short chime
}

const BarcodeDetector = 'BarcodeDetector' in globalThis ? globalThis.BarcodeDetector : BarcodeDetectorPatch;

export async function createBarcodeReader(callback = console.log, {
	delay = SCAN_DELAY,
	facingMode = FACING_MODE,
	formats = DEFAULT_BARCODE_FORMATS,
	frameRate = FRAME_RATE,
	chimeFrequency = CHIME_FREQUENCY,
	chimeDuration = CHIME_DURATION,
	chimeType = CHIME_TYPE,
	chimeVolume = CHIME_VOLUME,
	errorHandler = reportError,
	width,
	height,
	signal,
} = {}) {
	const { promise, resolve, reject } = Promise.withResolvers();

	if (signal instanceof AbortSignal && signal.aborted) {
		reject(signal.reason);
	} else {
		let frame = NaN;
		const controller = new AbortController();
		const loadController = new AbortController();
		const sig = signal instanceof AbortSignal
			? AbortSignal.any([signal, controller.signal])
			: controller.signal;

		const scanner = new BarcodeDetector({ formats });
		const wakeLock = 'wakeLock' in navigator ? await navigator.wakeLock.request('screen').catch(() => undefined) : undefined;
		const video = document.createElement('video');
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: { frameRate, facingMode, width, height },
		});

		const [track] = stream.getVideoTracks();

		video.srcObject = stream;
		video.play();

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
			resolve({ controller, video, stream, wakeLock, signal: sig });
			drawFrame();
			loadController.abort();
		}, { once: true, signal: sig });

		video.addEventListener('error', () => {
			loadController.abort();
			controller.abort(new DOMException('Error loading video stream.'));
		}, { once: true, signal: sig });

		sig.addEventListener('abort', async ({ target }) => {
			video.cancelVideoFrameCallback(frame);
			video.pause();
			stream.getTracks().forEach(track => track.stop());

			if (typeof wakeLock === 'object') {
				await wakeLock.release();
			}

			if (! loadController.signal.aborted) {
				loadController.abort(target.reason);
			}
		}, { once: true });
	}

	return promise;
}
