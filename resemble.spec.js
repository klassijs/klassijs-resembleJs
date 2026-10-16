'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const resemble = require('./resemble.js');

const PEOPLE = ['example/People.png', 'example/People2.png'];

describe('node-resemble.js', function() {
	afterEach(function() {
		resemble.outputSettings({
			errorColor: { red: 255, green: 0, blue: 255, alpha: 255 },
			errorType: 'flat',
			transparency: 1
		});
	});

	it('reports the YIQ mismatch for the people fixtures', function(done) {
		resemble(PEOPLE[0]).compareTo(PEOPLE[1]).onComplete(function(data) {
			expect(data.misMatchPercentage).toBe('13.17');
			expect(data.rawMisMatchPercentage).toBeCloseTo(13.17, 4);
			expect(data.isSameDimensions).toBe(true);
			expect(data.dimensionDifference).toEqual({ width: 0, height: 0 });
			expect(data.diffBounds).toEqual({ top: 56, left: 16, bottom: 431, right: 487 });
			expect(data.error).toBeUndefined();
			done();
		});
	});

	it('counts only the changed rectangle in a same-size pair', function(done) {
		const base = solid(10, 10, [255, 0, 0, 255]);
		const changed = solid(10, 10, [255, 0, 0, 255], function(x, y, pixel) {
			if (x >= 2 && x < 4 && y >= 2 && y < 4) {
				pixel[0] = 0;
				pixel[2] = 255;
			}
		});

		resemble(base).compareTo(changed).onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(4);
			expect(data.isSameDimensions).toBe(true);
			expect(data.dimensionDifference).toEqual({ width: 0, height: 0 });
			expect(data.diffBounds).toEqual({ top: 2, left: 2, bottom: 3, right: 3 });
			const diff = data.getDiffImage();
			expect(diff.width).toBe(10);
			expect(diff.height).toBe(10);
			expect(pixel(diff, 2, 2)).toEqual({ red: 255, green: 0, blue: 255, alpha: 255 });
			expect(pixel(diff, 0, 0).red).toBe(255);
			expect(pixel(diff, 0, 0).blue).toBe(0);
			done();
		});
	});

	it('counts pixels that exist in only one image', function(done) {
		const wide = paint(2, 2, function(x, y) {
			if (x === 0 && y === 0) return [255, 0, 0, 255];
			if (x === 1 && y === 0) return [0, 255, 0, 255];
			if (x === 0 && y === 1) return [0, 0, 255, 255];
			return [255, 255, 255, 255];
		});
		const narrow = paint(1, 2, function(x, y) {
			return y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255];
		});

		resemble(wide).compareTo(narrow).onComplete(function(data) {
			expect(data.isSameDimensions).toBe(false);
			expect(data.dimensionDifference).toEqual({ width: 1, height: 0 });
			expect(data.rawMisMatchPercentage).toBe(50);
			expect(data.diffBounds).toEqual({ top: 0, left: 1, bottom: 1, right: 1 });
			expect(data.getDiffImage().width).toBe(2);
			done();
		});
	});

	it('keeps the original image order when one input is decoded synchronously', function(done) {
		const png = solid(2, 2, [255, 0, 0, 255]);
		const jpg = jpeg.encode({
			data: solidPixels(4, 2, [0, 0, 255, 255]),
			width: 4,
			height: 2
		}, 90).data;

		resemble(png).compareTo(jpg).onComplete(function(first) {
			expect(first.dimensionDifference).toEqual({ width: -2, height: 0 });
			resemble(jpg).compareTo(png).onComplete(function(second) {
				expect(second.dimensionDifference).toEqual({ width: 2, height: 0 });
				expect(second.isSameDimensions).toBe(false);
				done();
			});
		});
	});

	it('treats fully transparent pixels as equal', function(done) {
		const white = solid(4, 4, [255, 255, 255, 0]);
		const black = solid(4, 4, [0, 0, 0, 0]);

		resemble(white).compareTo(black).onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(0);
			expect(data.diffBounds).toEqual({ top: 0, left: 0, bottom: 0, right: 0 });
			done();
		});
	});

	it('ignores a one-level channel change at the default tolerance', function(done) {
		const base = solid(4, 4, [200, 10, 10, 255]);
		const shifted = solid(4, 4, [201, 10, 10, 255]);

		resemble(base).compareTo(shifted).onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(0);
			done();
		});
	});

	it('reports that same one-level change when tolerance is strict', function(done) {
		const base = solid(4, 4, [200, 10, 10, 255]);
		const shifted = solid(4, 4, [201, 10, 10, 255]);

		resemble(base).compareTo(shifted).tolerance(0.1).onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(100);
			done();
		});
	});

	it('lets ignoreNothing restore the default tolerance', function(done) {
		const base = solid(2, 2, [200, 10, 10, 255]);
		const shifted = solid(2, 2, [201, 10, 10, 255]);

		resemble(base).compareTo(shifted).tolerance(0.1).ignoreNothing().onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(0);
			done();
		});
	});

	it('compares brightness when colours are ignored', function(done) {
		const red = solid(4, 4, [255, 0, 0, 255]);
		const sameLuma = solid(4, 4, [0, 130, 0, 255]);
		const white = solid(4, 4, [255, 255, 255, 255]);

		resemble(red).compareTo(sameLuma).ignoreColors().onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(0);
			resemble(red).compareTo(white).ignoreColors().onComplete(function(different) {
				expect(different.rawMisMatchPercentage).toBe(100);
				done();
			});
		});
	});

	it('does not let an ignored rectangle shrink the mismatch percentage', function(done) {
		const base = solid(10, 10, [255, 0, 0, 255]);
		const changed = solid(10, 10, [255, 0, 0, 255], function(x, y, pixel) {
			if (y === 0 || y === 9) {
				pixel[2] = 255;
			}
		});

		resemble(base).compareTo(changed).ignoreRectangles([[0, 0, 10, 1]]).onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBeCloseTo((10 / 90) * 100, 5);
			expect(data.diffBounds).toEqual({ top: 9, left: 0, bottom: 9, right: 9 });
			done();
		});
	});

	it('stops once the mismatch passes returnEarlyThreshold', function(done) {
		const red = solid(100, 100, [255, 0, 0, 255]);
		const blue = solid(100, 100, [0, 0, 255, 255]);

		resemble(red).compareTo(blue).returnEarlyThreshold(1).onComplete(function(data) {
			expect(data.analysisStoppedEarly).toBe(true);
			expect(data.rawMisMatchPercentage).toBeGreaterThan(1);
			expect(data.rawMisMatchPercentage).toBeLessThan(5);
			done();
		});
	});

	it('accepts antialiased edges only when asked', function(done) {
		const original = edgeImage(128, 128, 128);
		const tinted = edgeImage(160, 112, 128);

		resemble(original).compareTo(tinted).onComplete(function(plain) {
			expect(plain.rawMisMatchPercentage).toBeCloseTo((7 / 21) * 100, 5);
			expect(pixel(plain.getDiffImage(), 3, 1)).toEqual({ red: 255, green: 0, blue: 255, alpha: 255 });
			resemble(original).compareTo(tinted).ignoreAntialiasing().onComplete(function(ignored) {
				expect(ignored.rawMisMatchPercentage).toBeCloseTo((2 / 21) * 100, 5);
				expect(pixel(ignored.getDiffImage(), 3, 1)).toEqual({ red: 128, green: 128, blue: 128, alpha: 255 });
				done();
			});
		});
	});

	it('still flags an antialiased edge when the brightness changes', function(done) {
		const original = edgeImage(128, 128, 128);
		const shifted = edgeImage(255, 0, 0);

		resemble(original).compareTo(shifted).ignoreAntialiasing().onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBeGreaterThan(0);
			done();
		});
	});

	it('does not skip rows when ignoreAntialiasing is used on a large image', function(done) {
		resemble('example/LargeImage.png').compareTo('example/LargeImage.png').ignoreAntialiasing().onComplete(function(data) {
			expect(data.rawMisMatchPercentage).toBe(0);
			expect(pixel(data.getDiffImage(), 6, 1).alpha).toBe(255);
			expect(pixel(data.getDiffImage(), 6, 6).alpha).toBe(255);
			done();
		});
	});

	it('reads a JPEG buffer and a PNG path with any extension case', function(done) {
		const jpg = fs.readFileSync('example/People.jpg');
		const upper = path.join(os.tmpdir(), 'resemble-people-' + process.pid + '.PNG');
		fs.copyFileSync('example/SmallImage.png', upper);

		resemble(jpg).compareTo(jpg).onComplete(function(data) {
			expect(data.error).toBeUndefined();
			expect(data.isSameDimensions).toBe(true);
			expect(data.rawMisMatchPercentage).toBe(0);
			resemble(upper).compareTo(upper).onComplete(function(cased) {
				fs.unlinkSync(upper);
				expect(cased.error).toBeUndefined();
				expect(cased.rawMisMatchPercentage).toBe(0);
				done();
			});
		});
	});

	it('returns an error for a buffer that is not an image', function(done) {
		resemble(Buffer.from('not an image')).compareTo(Buffer.from('still not')).onComplete(function(data) {
			expect(data.error).toBeTruthy();
			done();
		});
	});

	it('returns an error when the file cannot be read', function(done) {
		resemble('example/does-not-exist.png').onComplete(function(data) {
			expect(data.error).toBeTruthy();
			expect(data.red).toBeUndefined();
			done();
		});
	});

	it('averages a single image on the 0 to 100 scale', function(done) {
		resemble(solid(2, 2, [255, 0, 0, 255])).onComplete(function(data) {
			expect(data.red).toBe(100);
			expect(data.green).toBe(0);
			expect(data.blue).toBe(0);
			expect(data.brightness).toBe(30);
			done();
		});
	});

	it('writes integer pixels into the diff and the jpeg copy', function(done) {
		resemble.outputSettings({ transparency: 0.5, errorType: 'movement' });
		const red = solid(2, 2, [255, 0, 0, 255]);
		const blue = solid(2, 2, [0, 0, 255, 255]);

		resemble(red).compareTo(blue).onComplete(function(data) {
			const diff = pixel(data.getDiffImage(), 0, 0);
			expect(diff.red).toBe(128);
			expect(diff.green).toBe(0);
			expect(diff.blue).toBe(255);
			expect(diff.alpha).toBe(255);
			expect(Number.isInteger(diff.red)).toBe(true);
			const encoded = data.getDiffImageAsJPEG(80);
			expect(encoded[0]).toBe(0xFF);
			expect(encoded[1]).toBe(0xD8);
			resemble(red).compareTo(red).onComplete(function(copy) {
				expect(pixel(copy.getDiffImage(), 0, 0).alpha).toBe(128);
				done();
			});
		});
	});

	it('keeps output settings on the comparison that was already created', function(done) {
		resemble.outputSettings({ errorColor: { red: 1, green: 2, blue: 3, alpha: 255 } });
		const pending = resemble(solid(2, 2, [255, 0, 0, 255])).compareTo(solid(2, 2, [0, 0, 255, 255]));
		resemble.outputSettings({ errorColor: { red: 9, green: 9, blue: 9, alpha: 255 } });

		pending.onComplete(function(data) {
			expect(pixel(data.getDiffImage(), 0, 0)).toEqual({ red: 1, green: 2, blue: 3, alpha: 255 });
			done();
		});
	});

	function solid(width, height, rgba, mutate) {
		return PNG.sync.write(image(width, height, function() {
			return rgba.slice();
		}, mutate));
	}

	function paint(width, height, fill) {
		return PNG.sync.write(image(width, height, fill));
	}

	function solidPixels(width, height, rgba) {
		const data = Buffer.alloc(width * height * 4);
		for (let i = 0; i < data.length; i += 4) {
			data[i] = rgba[0];
			data[i + 1] = rgba[1];
			data[i + 2] = rgba[2];
			data[i + 3] = rgba[3];
		}
		return data;
	}

	function image(width, height, fill, mutate) {
		const png = new PNG({ width: width, height: height });
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const value = fill(x, y);
				if (mutate) {
					mutate(x, y, value);
				}
				const index = (y * width + x) * 4;
				png.data[index] = value[0];
				png.data[index + 1] = value[1];
				png.data[index + 2] = value[2];
				png.data[index + 3] = value[3];
			}
		}
		return png;
	}

	function edgeImage(red, green, blue) {
		return paint(7, 3, function(x, y) {
			if (y === 0) return [0, 0, 0, 255];
			if (y === 2) return [255, 255, 255, 255];
			return [red, green, blue, 255];
		});
	}

	function pixel(imageData, x, y) {
		const index = (imageData.width * y + x) * 4;
		return {
			red: imageData.data[index],
			green: imageData.data[index + 1],
			blue: imageData.data[index + 2],
			alpha: imageData.data[index + 3]
		};
	}
});
