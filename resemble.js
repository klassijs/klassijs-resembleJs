'use strict';

const fs = require('fs');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

// YIQ distance limit. 16 ignores one-level export noise and shifts below
// about eight levels of green, and still fails a real colour change.
const DEFAULT_TOLERANCE = 16;
// Smallest YIQ distance per unit of dr^2+dg^2+db^2. A larger RGB step cannot
// fall inside `tolerance`, so the loop can reject it without the full formula.
const MIN_YIQ_PER_MAG = 0.044;

const defaults = {
	errorColor: { red: 255, green: 0, blue: 255, alpha: 255 },
	errorType: 'flat',
	transparency: 1
};

function cloneSettings() {
	return {
		errorColor: {
			red: defaults.errorColor.red,
			green: defaults.errorColor.green,
			blue: defaults.errorColor.blue,
			alpha: defaults.errorColor.alpha
		},
		errorType: defaults.errorType,
		transparency: defaults.transparency
	};
}

function resemble(fileData) {
	const settings = cloneSettings();
	const data = {};
	const updateCallbackArray = [];

	let tolerance = DEFAULT_TOLERANCE;
	let ignoreAntialiasing = false;
	let ignoreColors = false;
	let ignoreRectangles = null;
	let earlyThreshold = null;

	function triggerDataUpdate() {
		for (let i = 0; i < updateCallbackArray.length; i++) {
			if (typeof updateCallbackArray[i] === 'function') {
				updateCallbackArray[i](data);
			}
		}
	}

	function onComplete(callback) {
		updateCallbackArray.push(callback);
		loadImage(fileData, (err, image) => {
			if (err) {
				data.error = err;
				triggerDataUpdate();
				return;
			}
			parseImageInto(data, image.data, image.width, image.height);
			triggerDataUpdate();
		});
	}

	function compareTo(secondFileData) {
		const self = {
			ignoreNothing() {
				tolerance = DEFAULT_TOLERANCE;
				ignoreAntialiasing = false;
				ignoreColors = false;
				return self;
			},
			ignoreAntialiasing() {
				ignoreAntialiasing = true;
				ignoreColors = false;
				return self;
			},
			ignoreColors() {
				ignoreColors = true;
				ignoreAntialiasing = false;
				return self;
			},
			ignoreRectangles(rectangles) {
				ignoreRectangles = rectangles;
				return self;
			},
			tolerance(value) {
				if (typeof value === 'number' && isFinite(value) && value >= 0) {
					tolerance = value;
				}
				return self;
			},
			returnEarlyThreshold(value) {
				if (typeof value === 'number' && isFinite(value) && value >= 0) {
					earlyThreshold = value;
				}
				return self;
			},
			repaint() {
				return self;
			},
			onComplete(callback) {
				updateCallbackArray.push(callback);
				runCompare(fileData, secondFileData);
				return self;
			}
		};

		return self;
	}

	function runCompare(first, second) {
		const images = new Array(2);
		let pending = 2;
		let failed = false;

		function finish(index, err, image) {
			if (failed) {
				return;
			}
			if (err) {
				failed = true;
				data.error = err;
				triggerDataUpdate();
				return;
			}
			images[index] = image;
			pending -= 1;
			if (pending === 0) {
				try {
					analyseImages(images[0], images[1], settings, {
						tolerance,
						ignoreAntialiasing,
						ignoreColors,
						ignoreRectangles,
						earlyThreshold
					}, data);
				} catch (analyseErr) {
					data.error = analyseErr;
				}
				triggerDataUpdate();
			}
		}

		loadImage(first, (err, image) => finish(0, err, image));
		loadImage(second, (err, image) => finish(1, err, image));
	}

	return {
		onComplete,
		compareTo
	};
}

resemble.outputSettings = function outputSettings(options) {
	const source = options || {};

	if (source.errorColor) {
		const color = source.errorColor;
		if (color.red !== undefined) defaults.errorColor.red = color.red;
		if (color.green !== undefined) defaults.errorColor.green = color.green;
		if (color.blue !== undefined) defaults.errorColor.blue = color.blue;
		if (color.alpha !== undefined) defaults.errorColor.alpha = color.alpha;
	}

	if (source.errorType === 'flat' || source.errorType === 'movement') {
		defaults.errorType = source.errorType;
	}

	if (typeof source.transparency === 'number' && isFinite(source.transparency)) {
		defaults.transparency = source.transparency;
	}

	return this;
};

function loadImage(fileData, callback) {
	if (Buffer.isBuffer(fileData)) {
		let image;
		let error;
		try {
			image = decodeImage(fileData);
		} catch (err) {
			error = err;
		}
		process.nextTick(() => callback(error, image));
		return;
	}

	if (typeof fileData !== 'string' || fileData.length === 0) {
		process.nextTick(() => callback(new Error('Unsupported image input')));
		return;
	}

	fs.readFile(fileData, (err, buffer) => {
		if (err) {
			callback(err);
			return;
		}
		try {
			callback(null, decodeImage(buffer));
		} catch (decodeErr) {
			callback(decodeErr);
		}
	});
}

function decodeImage(buffer) {
	if (isPng(buffer)) {
		const png = PNG.sync.read(buffer);
		return { width: png.width, height: png.height, data: png.data };
	}

	if (isJpeg(buffer)) {
		const decoded = jpeg.decode(buffer, {
			useTArray: true,
			formatAsRGBA: true,
			maxResolutionInMP: 100,
			maxMemoryUsageInMB: 512
		});
		return { width: decoded.width, height: decoded.height, data: decoded.data };
	}

	throw new Error('Unsupported image format');
}

function isPng(buffer) {
	return buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4E &&
		buffer[3] === 0x47;
}

function isJpeg(buffer) {
	return buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8;
}

function parseImageInto(target, sourceImageData, width, height) {
	const pixelCount = width * height;
	if (!pixelCount) {
		target.error = new Error('Image has no pixels');
		return;
	}

	let redTotal = 0;
	let greenTotal = 0;
	let blueTotal = 0;
	let brightnessTotal = 0;

	for (let i = 0; i < width * height * 4; i += 4) {
		const red = sourceImageData[i];
		const green = sourceImageData[i + 1];
		const blue = sourceImageData[i + 2];
		redTotal += red / 255 * 100;
		greenTotal += green / 255 * 100;
		blueTotal += blue / 255 * 100;
		brightnessTotal += (0.3 * red + 0.59 * green + 0.11 * blue) / 255 * 100;
	}

	target.red = Math.floor(redTotal / pixelCount);
	target.green = Math.floor(greenTotal / pixelCount);
	target.blue = Math.floor(blueTotal / pixelCount);
	target.brightness = Math.floor(brightnessTotal / pixelCount);
}

function analyseImages(img1, img2, settings, options, data) {
	const started = process.hrtime.bigint();
	const width1 = img1.width | 0;
	const height1 = img1.height | 0;
	const width2 = img2.width | 0;
	const height2 = img2.height | 0;
	const overlapWidth = Math.min(width1, width2);
	const overlapHeight = Math.min(height1, height2);
	const unionWidth = Math.max(width1, width2);
	const unionHeight = Math.max(height1, height2);
	const maskInfo = buildMask(options.ignoreRectangles, overlapWidth, overlapHeight);
	const masked = maskInfo ? maskInfo.masked : 0;
	const totalPixels = unionWidth * unionHeight;
	const counted = totalPixels - masked;
	const nonOverlap = totalPixels - (overlapWidth * overlapHeight);

	data.isSameDimensions = width1 === width2 && height1 === height2;
	data.dimensionDifference = { width: width1 - width2, height: height1 - height2 };

	const diffImage = new PNG({ width: unionWidth, height: unionHeight });
	const target = diffImage.data;
	const bounds = { top: Infinity, left: Infinity, bottom: -1, right: -1 };
	let mismatchCount = 0;
	let stopped = false;

	const identical = width1 === width2 &&
		height1 === height2 &&
		!maskInfo &&
		settings.transparency === 1 &&
		sameBytes(img1.data, img2.data);

	if (identical) {
		target.set(img1.data.subarray(0, target.length));
	} else if (nonOverlapExceeds(options.earlyThreshold, nonOverlap, counted)) {
		stopped = true;
	} else if (useFastLoop(options, settings, maskInfo)) {
		mismatchCount = compareFast(
			img1.data,
			img2.data,
			width1,
			width2,
			overlapWidth,
			overlapHeight,
			unionWidth,
			target,
			options.tolerance,
			settings.errorColor,
			bounds
		);
		stopped = mismatchCount.stopped;
		mismatchCount = mismatchCount.count;
	} else {
		const general = compareGeneral(
			img1,
			img2,
			overlapWidth,
			overlapHeight,
			unionWidth,
			target,
			settings,
			options,
			maskInfo,
			bounds,
			counted,
			nonOverlap
		);
		mismatchCount = general.count;
		stopped = general.stopped;
	}

	if (!identical) {
		mismatchCount += paintMissing(target, unionWidth, unionHeight, overlapWidth, overlapHeight, settings.errorColor, bounds);
	}

	const raw = counted === 0 ? 0 : (mismatchCount / counted) * 100;
	data.rawMisMatchPercentage = raw;
	data.misMatchPercentage = raw.toFixed(2);
	data.analysisStoppedEarly = stopped;
	data.diffBounds = bounds.bottom < 0 ? { top: 0, left: 0, bottom: 0, right: 0 } : {
		top: bounds.top,
		left: bounds.left,
		bottom: bounds.bottom,
		right: bounds.right
	};
	data.analysisTime = Number(process.hrtime.bigint() - started) / 1e6;
	data.getDiffImage = function getDiffImage() {
		return diffImage;
	};
	data.getDiffImageAsJPEG = function getDiffImageAsJPEG(quality) {
		return jpeg.encode({
			data: target,
			width: unionWidth,
			height: unionHeight
		}, quality !== undefined ? quality : 50).data;
	};
}

function nonOverlapExceeds(earlyThreshold, nonOverlap, counted) {
	if (earlyThreshold == null || counted === 0) {
		return false;
	}
	return (nonOverlap / counted) * 100 > earlyThreshold;
}

function useFastLoop(options, settings, maskInfo) {
	return !options.ignoreAntialiasing &&
		!options.ignoreColors &&
		!maskInfo &&
		settings.transparency === 1 &&
		settings.errorType === 'flat' &&
		options.earlyThreshold == null;
}

function compareFast(data1, data2, width1, width2, overlapWidth, overlapHeight, unionWidth, target, tolerance, errorColor, bounds) {
	const view1 = uint32View(data1);
	const view2 = uint32View(data2);
	const viewOut = uint32View(target);
	let count = 0;

	if (!view1 || !view2 || !viewOut) {
		return compareFastBytes(data1, data2, width1, width2, overlapWidth, overlapHeight, unionWidth, target, tolerance, errorColor, bounds);
	}

	const errorWord = colorWord(errorColor);

	for (let y = 0; y < overlapHeight; y++) {
		let p1 = y * width1;
		let p2 = y * width2;
		let pOut = y * unionWidth;
		for (let x = 0; x < overlapWidth; x++, p1++, p2++, pOut++) {
			const word1 = view1[p1];
			if (word1 === view2[p2]) {
				viewOut[pOut] = word1;
				continue;
			}

			const i1 = p1 << 2;
			const i2 = p2 << 2;
			if (!rgbaDiffers(data1, i1, data2, i2, tolerance)) {
				viewOut[pOut] = word1;
				continue;
			}

			viewOut[pOut] = errorWord;
			if (x < bounds.left) bounds.left = x;
			if (x > bounds.right) bounds.right = x;
			if (y < bounds.top) bounds.top = y;
			if (y > bounds.bottom) bounds.bottom = y;
			count += 1;
		}
	}

	return { count, stopped: false };
}

function compareFastBytes(data1, data2, width1, width2, overlapWidth, overlapHeight, unionWidth, target, tolerance, errorColor, bounds) {
	let count = 0;

	for (let y = 0; y < overlapHeight; y++) {
		for (let x = 0; x < overlapWidth; x++) {
			const i1 = (y * width1 + x) << 2;
			const i2 = (y * width2 + x) << 2;
			const offset = (y * unionWidth + x) << 2;
			if (!rgbaDiffers(data1, i1, data2, i2, tolerance)) {
				copyOpaque(target, offset, data1, i1);
				continue;
			}
			writeFlat(target, offset, errorColor);
			expand(bounds, x, y);
			count += 1;
		}
	}

	return { count, stopped: false };
}

function rgbaDiffers(data1, i1, data2, i2, tolerance) {
	const r1 = data1[i1];
	const g1 = data1[i1 + 1];
	const b1 = data1[i1 + 2];
	const a1 = data1[i1 + 3];
	const r2 = data2[i2];
	const g2 = data2[i2 + 1];
	const b2 = data2[i2 + 2];
	const a2 = data2[i2 + 3];

	if (a1 === 0 && a2 === 0) {
		return false;
	}
	if (a1 === 255 && a2 === 255) {
		const dr = r1 - r2;
		const dg = g1 - g2;
		const db = b1 - b2;
		if ((dr * dr + dg * dg + db * db) * MIN_YIQ_PER_MAG > tolerance) {
			return true;
		}
	}
	return yiqDistance(r1, g1, b1, a1, r2, g2, b2, a2) > tolerance;
}

function colorWord(color) {
	const bytes = new Uint8Array(4);
	bytes[0] = color.red & 255;
	bytes[1] = color.green & 255;
	bytes[2] = color.blue & 255;
	bytes[3] = color.alpha & 255;
	return new Uint32Array(bytes.buffer)[0];
}

function compareGeneral(img1, img2, overlapWidth, overlapHeight, unionWidth, target, settings, options, maskInfo, bounds, counted, nonOverlap) {
	const data1 = img1.data;
	const data2 = img2.data;
	const width1 = img1.width;
	const width2 = img2.width;
	const mask = maskInfo ? maskInfo.mask : null;
	let count = 0;
	let stopped = false;

	for (let y = 0; y < overlapHeight && !stopped; y++) {
		for (let x = 0; x < overlapWidth; x++) {
			const i1 = (y * width1 + x) * 4;
			const i2 = (y * width2 + x) * 4;
			const offset = (y * unionWidth + x) * 4;
			const r1 = data1[i1];
			const g1 = data1[i1 + 1];
			const b1 = data1[i1 + 2];
			const a1 = data1[i1 + 3];
			const r2 = data2[i2];
			const g2 = data2[i2 + 1];
			const b2 = data2[i2 + 2];
			const a2 = data2[i2 + 3];

			if (mask && mask[y * overlapWidth + x]) {
				writeGray(target, offset, r2, g2, b2, a2, settings.transparency);
				continue;
			}

			if (!pixelsDiffer(r1, g1, b1, a1, r2, g2, b2, a2, options.tolerance, options.ignoreColors)) {
				if (options.ignoreColors) {
					writeGray(target, offset, r2, g2, b2, a2, settings.transparency);
				} else {
					writeCopy(target, offset, r1, g1, b1, a1, settings.transparency);
				}
				continue;
			}

			if (options.ignoreAntialiasing && lumaWithinTolerance(r1, g1, b1, a1, r2, g2, b2, a2, options.tolerance)) {
				const onEdge = isAntialiased(data1, width1, data2, width2, x, y, overlapWidth, overlapHeight) ||
					isAntialiased(data2, width2, data1, width1, x, y, overlapWidth, overlapHeight);
				if (onEdge) {
					writeGray(target, offset, r2, g2, b2, a2, settings.transparency);
					continue;
				}
			}

			writeMismatch(target, offset, settings, r2, g2, b2, a2);
			expand(bounds, x, y);
			count += 1;
			if (options.earlyThreshold != null && counted > 0 && ((count + nonOverlap) / counted) * 100 > options.earlyThreshold) {
				stopped = true;
				break;
			}
		}
	}

	return { count, stopped };
}

function pixelsDiffer(r1, g1, b1, a1, r2, g2, b2, a2, tolerance, colorsOnly) {
	if (a1 === 0 && a2 === 0) {
		return false;
	}
	if (r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2) {
		return false;
	}

	if (!colorsOnly && a1 === 255 && a2 === 255) {
		const dr = r1 - r2;
		const dg = g1 - g2;
		const db = b1 - b2;
		if ((dr * dr + dg * dg + db * db) * MIN_YIQ_PER_MAG > tolerance) {
			return true;
		}
	}

	const distance = colorsOnly
		? lumaDistance(r1, g1, b1, a1, r2, g2, b2, a2)
		: yiqDistance(r1, g1, b1, a1, r2, g2, b2, a2);
	return distance > tolerance;
}

function lumaWithinTolerance(r1, g1, b1, a1, r2, g2, b2, a2, tolerance) {
	return lumaDistance(r1, g1, b1, a1, r2, g2, b2, a2) <= tolerance;
}

function yiqDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
	const left = blendedRgb(r1, g1, b1, a1);
	const right = blendedRgb(r2, g2, b2, a2);
	const dr = left.r - right.r;
	const dg = left.g - right.g;
	const db = left.b - right.b;
	const y = 0.29889531 * dr + 0.58662247 * dg + 0.11448223 * db;
	const i = 0.59597799 * dr - 0.2741761 * dg - 0.32180189 * db;
	const q = 0.21147017 * dr - 0.52261711 * dg + 0.31114694 * db;
	return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

function lumaDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
	const y = lumaDelta(r1, g1, b1, a1, r2, g2, b2, a2);
	return 0.5053 * y * y;
}

function lumaDelta(r1, g1, b1, a1, r2, g2, b2, a2) {
	const left = blendedRgb(r1, g1, b1, a1);
	const right = blendedRgb(r2, g2, b2, a2);
	return 0.29889531 * (left.r - right.r) +
		0.58662247 * (left.g - right.g) +
		0.11448223 * (left.b - right.b);
}

function blendedRgb(r, g, b, a) {
	if (a < 255) {
		const alpha = a / 255;
		r = 255 + (r - 255) * alpha;
		g = 255 + (g - 255) * alpha;
		b = 255 + (b - 255) * alpha;
	}
	return { r, g, b };
}

function isAntialiased(data, stride, other, otherStride, x, y, overlapWidth, overlapHeight) {
	const x0 = Math.max(x - 1, 0);
	const y0 = Math.max(y - 1, 0);
	const x2 = Math.min(x + 1, overlapWidth - 1);
	const y2 = Math.min(y + 1, overlapHeight - 1);
	const pos = (y * stride + x) * 4;
	let zeroes = (x === x0 || x === x2 || y === y0 || y === y2) ? 1 : 0;
	let min = 0;
	let max = 0;
	let minX = 0;
	let minY = 0;
	let maxX = 0;
	let maxY = 0;
	const r = data[pos];
	const g = data[pos + 1];
	const b = data[pos + 2];
	const a = data[pos + 3];

	for (let nx = x0; nx <= x2; nx++) {
		for (let ny = y0; ny <= y2; ny++) {
			if (nx === x && ny === y) {
				continue;
			}
			const next = (ny * stride + nx) * 4;
			const delta = lumaDelta(r, g, b, a, data[next], data[next + 1], data[next + 2], data[next + 3]);
			if (delta === 0) {
				zeroes += 1;
				if (zeroes > 2) {
					return false;
				}
			} else if (delta < min) {
				min = delta;
				minX = nx;
				minY = ny;
			} else if (delta > max) {
				max = delta;
				maxX = nx;
				maxY = ny;
			}
		}
	}

	if (min === 0 || max === 0) {
		return false;
	}

	const darkestIsSolid = hasManySiblings(data, stride, minX, minY, overlapWidth, overlapHeight) &&
		hasManySiblings(other, otherStride, minX, minY, overlapWidth, overlapHeight);
	const brightestIsSolid = hasManySiblings(data, stride, maxX, maxY, overlapWidth, overlapHeight) &&
		hasManySiblings(other, otherStride, maxX, maxY, overlapWidth, overlapHeight);
	return darkestIsSolid || brightestIsSolid;
}

function hasManySiblings(data, stride, x, y, limitWidth, limitHeight) {
	const x0 = Math.max(x - 1, 0);
	const y0 = Math.max(y - 1, 0);
	const x2 = Math.min(x + 1, limitWidth - 1);
	const y2 = Math.min(y + 1, limitHeight - 1);
	const pos = (y * stride + x) * 4;
	let zeroes = (x === x0 || x === x2 || y === y0 || y === y2) ? 1 : 0;
	const r = data[pos];
	const g = data[pos + 1];
	const b = data[pos + 2];
	const a = data[pos + 3];

	for (let nx = x0; nx <= x2; nx++) {
		for (let ny = y0; ny <= y2; ny++) {
			if (nx === x && ny === y) {
				continue;
			}
			const next = (ny * stride + nx) * 4;
			if (data[next] === r && data[next + 1] === g && data[next + 2] === b && data[next + 3] === a) {
				zeroes += 1;
				if (zeroes > 2) {
					return true;
				}
			}
		}
	}

	return false;
}

function buildMask(rectangles, overlapWidth, overlapHeight) {
	if (!Array.isArray(rectangles) || rectangles.length === 0 || overlapWidth === 0 || overlapHeight === 0) {
		return null;
	}

	const mask = Buffer.alloc(overlapWidth * overlapHeight);
	let masked = 0;

	for (let i = 0; i < rectangles.length; i++) {
		const rect = rectangles[i];
		if (!rect || rect.length < 4) {
			continue;
		}
		const rx = rect[0] | 0;
		const ry = rect[1] | 0;
		const rw = rect[2] | 0;
		const rh = rect[3] | 0;
		if (rw <= 0 || rh <= 0) {
			continue;
		}
		const x0 = Math.max(0, rx);
		const y0 = Math.max(0, ry);
		const x1 = Math.min(overlapWidth, rx + rw);
		const y1 = Math.min(overlapHeight, ry + rh);
		for (let y = y0; y < y1; y++) {
			const row = y * overlapWidth;
			for (let x = x0; x < x1; x++) {
				if (mask[row + x] === 0) {
					mask[row + x] = 1;
					masked += 1;
				}
			}
		}
	}

	if (masked === 0) {
		return null;
	}

	return { mask, masked };
}

function paintMissing(target, unionWidth, unionHeight, overlapWidth, overlapHeight, color, bounds) {
	let count = 0;
	for (let y = 0; y < overlapHeight; y++) {
		for (let x = overlapWidth; x < unionWidth; x++) {
			writeFlat(target, (y * unionWidth + x) * 4, color);
			expand(bounds, x, y);
			count += 1;
		}
	}
	for (let y = overlapHeight; y < unionHeight; y++) {
		for (let x = 0; x < unionWidth; x++) {
			writeFlat(target, (y * unionWidth + x) * 4, color);
			expand(bounds, x, y);
			count += 1;
		}
	}
	return count;
}

function expand(bounds, x, y) {
	if (y < bounds.top) bounds.top = y;
	if (y > bounds.bottom) bounds.bottom = y;
	if (x < bounds.left) bounds.left = x;
	if (x > bounds.right) bounds.right = x;
}

function sameBytes(left, right) {
	return left && right && left.length === right.length && Buffer.compare(left, right) === 0;
}

function uint32View(data) {
	if (!data || (data.byteOffset % 4) !== 0 || (data.byteLength % 4) !== 0) {
		return null;
	}
	return new Uint32Array(data.buffer, data.byteOffset, data.byteLength >>> 2);
}

function copyOpaque(target, offset, source, sourceOffset) {
	target[offset] = source[sourceOffset];
	target[offset + 1] = source[sourceOffset + 1];
	target[offset + 2] = source[sourceOffset + 2];
	target[offset + 3] = source[sourceOffset + 3];
}

function writeCopy(target, offset, r, g, b, a, transparency) {
	target[offset] = r;
	target[offset + 1] = g;
	target[offset + 2] = b;
	target[offset + 3] = transparency === 1 ? a : Math.round(a * transparency);
}

function writeGray(target, offset, r, g, b, a, transparency) {
	const bright = Math.round(0.29889531 * r + 0.58662247 * g + 0.11448223 * b);
	target[offset] = bright;
	target[offset + 1] = bright;
	target[offset + 2] = bright;
	target[offset + 3] = Math.round(a * transparency);
}

function writeFlat(target, offset, color) {
	target[offset] = color.red | 0;
	target[offset + 1] = color.green | 0;
	target[offset + 2] = color.blue | 0;
	target[offset + 3] = color.alpha | 0;
}

function writeMismatch(target, offset, settings, r2, g2, b2, a2) {
	if (settings.errorType === 'movement') {
		const color = settings.errorColor;
		target[offset] = Math.round(((r2 * (color.red / 255)) + color.red) / 2);
		target[offset + 1] = Math.round(((g2 * (color.green / 255)) + color.green) / 2);
		target[offset + 2] = Math.round(((b2 * (color.blue / 255)) + color.blue) / 2);
		target[offset + 3] = a2 | 0;
		return;
	}
	writeFlat(target, offset, settings.errorColor);
}

module.exports = resemble;
