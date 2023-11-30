'use strict';

describe('node-resemble.js', function() {
  let EXAMPLE_LARGE_IMAGE = 'example/LargeImage.png';
  let EXAMPLE_SMALL_IMAGE = 'example/SmallImage.png';
  let EXAMPLE_PEOPLE_IMAGES = [
	  'example/People.png',
	  'example/People2.png'
  ];
  let OPTIMISATION_SKIP_STEP = 6;
  let DEFAULT_LARGE_IMAGE_THRESHOLD = 1200;

  let resemble = require('./resemble.js');

  describe('largeImageThreshold', function() {
    describe('when unset', function() {
      describe('when ignoreAntialiasing is enabled', function() {
        it('skips pixels when a dimension is larger than the default threshold (1200)', function(done) {
          getLargeImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels when both dimensions are smaller than the default threshold (1200)', function(done) {
          getSmallImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });

      describe('when ignoreAntialiasing is disabled', function() {
        it('does not skip pixels when a dimension is larger than the default threshold (1200)', function(done) {
          getLargeImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels when both dimensions are smaller than the default threshold (1200)', function(done) {
          getSmallImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });
    });

    describe('when explicitly set', function() {
      afterAll(function() {
        resemble.outputSettings({largeImageThreshold: DEFAULT_LARGE_IMAGE_THRESHOLD});
      });

      describe('when ignoreAntialiasing is enabled', function() {
        it('skips pixels on images with a dimension larger than the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 999});
          getSmallImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with a dimension equal to the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 1000});
          getSmallImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with both dimensions smaller than the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 1001});
          getSmallImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });

      describe('when ignoreAntialiasing is disabled', function() {
        it('does not skip pixels on images with a dimension larger than the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 999});
          getSmallImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with a dimension equal to the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 1000});
          getSmallImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with both dimensions smaller than the given threshold', function(done) {
          resemble.outputSettings({largeImageThreshold: 1001});
          getSmallImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });
    });

    describe('when set to a falsy value', function() {
      beforeEach(function() {
        resemble.outputSettings({largeImageThreshold: 0});
      });

      afterAll(function() {
        resemble.outputSettings({largeImageThreshold: DEFAULT_LARGE_IMAGE_THRESHOLD});
      });

      describe('when ignoreAntialiasing is enabled', function() {
        it('does not skip pixels on images with a dimension larger than the default threshold (1200)', function(done) {
          getLargeImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with a dimension smaller than the default threshold (1200)', function(done) {
          getSmallImageComparison().ignoreAntialiasing().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });

      describe('when ignoreAntialiasing is disabled', function() {
        it('does not skip pixels on images with a dimension larger than the default threshold (1200)', function(done) {
          getLargeImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });

        it('does not skip pixels on images with a dimension smaller than the default threshold (1200)', function(done) {
          getSmallImageComparison().onComplete(function(data) {
            expectPixelsNotToBeSkipped(data.getDiffImage(), OPTIMISATION_SKIP_STEP);
            done();
          });
        });
      });
    });

    function expectPixelsToBeSkipped(image, step) {
      expect(getPixelForLocation(image, 1, step - 1).alpha).not.toBe(0);
      expect(getPixelForLocation(image, 1, step).alpha).toBe(0);
      expect(getPixelForLocation(image, 1, step + 1).alpha).not.toBe(0);

      expect(getPixelForLocation(image, step - 1, 1).alpha).not.toBe(0);
      expect(getPixelForLocation(image, step, 1).alpha).toBe(0);
      expect(getPixelForLocation(image, step + 1, 1).alpha).not.toBe(0);

      expect(getPixelForLocation(image, step, step).alpha).toBe(0);
    }

    function expectPixelsNotToBeSkipped(image, step) {
      expect(getPixelForLocation(image, 1, step).alpha).not.toBe(0);
      expect(getPixelForLocation(image, step, 1).alpha).not.toBe(0);
      expect(getPixelForLocation(image, step, step).alpha).not.toBe(0);
    }
  });

  it('rawMisMatchPercentage contains raw result', function(done) {
	  resemble(
	  	EXAMPLE_PEOPLE_IMAGES[0]
	  ).compareTo(
	  	EXAMPLE_PEOPLE_IMAGES[1]
	  ).onComplete(function(data) {
		  expect(data.rawMisMatchPercentage).toBe(8.6612);
		  done();
	  });
  });

  function getLargeImageComparison() {
    return resemble(EXAMPLE_LARGE_IMAGE).compareTo(EXAMPLE_LARGE_IMAGE);
  }

  function getSmallImageComparison() {
    return resemble(EXAMPLE_SMALL_IMAGE).compareTo(EXAMPLE_SMALL_IMAGE);
  }

  function getPixelForLocation(image, x, y) {
    let index = (image.width * y + x) << 2;
    return {
      red: image.data[index],
      green: image.data[index + 1],
      blue: image.data[index + 2],
      alpha: image.data[index + 3]
    };
  }
});
