node-resemble.js
================

Analyse and compare images with Javascript. This project does not need canvas or any other binary dependencies.
It is a modification of [Resemble.js](https://github.com/Huddle/Resemble.js)


### Get it

`yarn add klassijs-resemble-js`

### Example

Retrieve basic analysis on image.

```javascript
var api = resemble(fileData).onComplete(function(data){
	console.log(data);
	/*
	{
	  red: 255,
	  green: 255,
	  blue: 255,
	  brightness: 255
	}
	*/
});
```

Use resemble to compare two images. The default `tolerance` is `16` (a YIQ distance). That ignores one-level export noise and still fails a real colour change. Pass a smaller number, such as `0.1`, for a stricter compare.

```javascript
var diff = resemble(file).compareTo(file2).tolerance(16).ignoreAntialiasing().onComplete(function(data){
	console.log(data);
	/*
	{
	  misMatchPercentage : 100, // %
	  rawMisMatchPercentage : 100,
	  isSameDimensions: true, // or false
	  dimensionDifference: { width: 0, height: -1 }, // width/height of the first image minus the second
	  diffBounds: { top: 0, left: 0, bottom: 0, right: 0 },
	  analysisStoppedEarly: false,
	  getDiffImage: function(){}
	}
	*/
});
```

Images of different sizes are compared on their overlap. Pixels that exist in only one image count as a mismatch, and the percentage is based on the area of the larger image.

`returnEarlyThreshold(percent)` stops the scan once the running mismatch is already above that percentage. `rawMisMatchPercentage` is then the value so far, and `analysisStoppedEarly` is `true`. `diffBounds` is the inclusive box of the mismatch pixels found, including the extra strip when the sizes differ.

You can also change the comparison method after the first analysis.

```javascript
// diff.ignoreNothing();
// diff.ignoreColors();
diff.ignoreAntialiasing();
```

And change the output display style.

```javascript
resemble.outputSettings({
  errorColor: {
    red: 255,
    green: 0,
    blue: 255
  },
  errorType: 'movement',
  transparency: 0.3
});
// resembleControl.repaint();
```

--------------------------------------
## Example usuage (in cucumber step definition)


     this.Then(/^Screenshot should match image "(.*)"$/, function (image, callback) {
        browser.takeScreenshot().then(function(pngString) {
          var screenshot = Buffer.from(pngString, 'base64');

          resemble(image)
            .compareTo(screenshot)
            .tolerance(16)
            .ignoreAntialiasing()
            .onComplete(function(data){

              if (data.rawMisMatchPercentage <= 0.01) {
                callback();
              } else {
                data.getDiffImage().pack().pipe(fs.createWriteStream(image + 'diff.png'));
                callback.fail(new Error("Screenshot '" + image+  "' differ " + data.misMatchPercentage + "%"));
              }
            });
        });
      })

--------------------------------------

Credits:
 * Created by [James Cryer](https://github.com/jamescryer) and the Huddle development team.
 * [Lukas Svoboda](https://github.com/lksv) - modification for node.js
 * [Mirza Zeyrek](https://github.com/mirzazeyrek) - jpeg support
 * [LarryG](https://github.com/larryg01) - dependency updates