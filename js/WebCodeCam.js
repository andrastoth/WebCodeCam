/*!
 * jQuery Plugin WebCodeCam-0.1.0
 * Author: Tóth András
 * Web: http://atandrastoth.co.uk
 * email: atandrastoth@gmail.com
 * Licensed under the MIT license
 */
/*
Included:
barcode decoder (DecoderWorker.js) -> https://github.com/EddieLa/BarcodeReader/blob/master/src/DecoderWorker.js
qr-decoder (qrcodelib.js) -> https://github.com/LazarSoft/jsqrcode
*/
;
(function($, window, document, undefined) {
    var camera = $('<video style="position:absolute;visibility:hidden;display: none;">')[0];
    var lastImageSrc;
    var flipped = false;
    var isStreaming = false;
    var con;
    var display;
    var w, h;
    var DecodeWorker = new Worker("js/DecoderWorker.js");
    var delay = false;
    var streams = [];
    var pluginName = "WebCodeCam",
        defaults = {
            ReadQRCode: true,
            ReadBarecode: true,
            width: 320,
            height: 240,
            videoSource: {
                id: true,
                maxWidth: 640,
                maxHeight: 480
            },
            flipVertical: false,
            flipHorizontal: false,
            zoom: -1,
            beep: "js/beep.mp3",
            brightness: 0,
            autoBrightnessValue: false,
            grayScale: false,
            contrast: 0,
            threshold: 0,
            sharpness: [],
            resultFunction: function(resText, lastImageSrc) {}
        };

    function Plugin(element, options) {
        this.element = element;
        display = $(element);
        this.options = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        if (this.init()) {
            this.setEventListeners();
            if (this.options.ReadQRCode || this.options.ReadBarecode) {
                this.setCallback();
            };
        }
    }
    Plugin.prototype = {
        init: function() {
            con = this.element.getContext('2d');
            w = this.options.width;
            h = this.options.height;
            navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
            if (navigator.getUserMedia) {
                navigator.getUserMedia({
                    video: {
                        mandatory: {
                            maxWidth: this.options.videoSource.maxWidth,
                            maxHeight: this.options.videoSource.maxHeight
                        },
                        optional: [{
                            sourceId: this.options.videoSource.id
                        }]
                    },
                    audio: false
                }, this.cameraSuccess, this.cameraError);
            } else {
                alert('Sorry, the browser you are using doesn\'t support getUserMedia');
                return false;
            }
            return true;
        },
        cameraSuccess: function(stream) {
            var url = window.URL || window.webkitURL;
            camera.src = url ? url.createObjectURL(stream) : stream;
            streams.push(stream);
            camera.play();
        },
        cameraError: function(error) {
            alert('Something went wrong. (error code ' + error.code + ')');
            return false;
        },
        setEventListeners: function() {
            camera.addEventListener('canplay', function(e) {
                if (!isStreaming) {
                    if (camera.videoWidth > 0) h = camera.videoHeight / (camera.videoWidth / w);
                    display[0].setAttribute('width', w);
                    display[0].setAttribute('height', h);
                    if (display.data().plugin_WebCodeCam.options.flipHorizontal) {
                        con.scale(-1, 1);
                        con.translate(-w, 0);
                    }
                    if (display.data().plugin_WebCodeCam.options.flipVertical) {
                        con.scale(1, -1);
                        con.translate(0, -h);
                    }
                    isStreaming = true;
                    if (display.data().plugin_WebCodeCam.options.ReadQRCode || display.data().plugin_WebCodeCam.options.ReadBarecode) {
                        display.data().plugin_WebCodeCam.delay();
                    }
                }
            }, false);
            camera.addEventListener('play', function() {
                setInterval(function() {
                    if (camera.paused || camera.ended) return;
                    con.clearRect(0, 0, w, h);
                    var z = display.data().plugin_WebCodeCam.options.zoom;
                    if (z < 0) {
                        z = display.data().plugin_WebCodeCam.optimalZoom();
                    }
                    con.drawImage(camera, (w * z - w) / -2, (h * z - h) / -2, w * z, h * z);
                    var imageData = con.getImageData(0, 0, w, h);
                    var brightness = display.data().plugin_WebCodeCam.options.brightness;
                    var grayScale = display.data().plugin_WebCodeCam.options.grayScale;
                    var threshold = display.data().plugin_WebCodeCam.options.threshold;
                    var sharpness = display.data().plugin_WebCodeCam.options.sharpness;
                    var contrast = display.data().plugin_WebCodeCam.options.contrast;
                    var autoBrightnessValue = display.data().plugin_WebCodeCam.options.autoBrightnessValue;
                    if (grayScale) {
                        imageData = display.data().plugin_WebCodeCam.grayScale(imageData);
                    }
                    if (brightness != 0 || autoBrightnessValue != false) {
                        imageData = display.data().plugin_WebCodeCam.brightness(imageData, brightness);
                    }
                    if (contrast != 0) {
                        imageData = display.data().plugin_WebCodeCam.contrast(imageData, contrast);
                    }
                    if (threshold != 0) {
                        imageData = display.data().plugin_WebCodeCam.threshold(imageData, threshold);
                    }
                    if (sharpness.length != 0) {
                        imageData = display.data().plugin_WebCodeCam.convolute(imageData, sharpness);
                    }
                    con.putImageData(imageData, 0, 0);
                }, 40);
            }, false);
        },
        setCallback: function() {
            DecodeWorker.onmessage = function(e) {
                if (delay || camera.paused) return;
                if (e.data.success && e.data.result[0].length > 1 && e.data.result[0].indexOf("undefined") == -1) {
                    delay = true;
                    display.data().plugin_WebCodeCam.delay();
                    display.data().plugin_WebCodeCam.beep();
                    display.data().plugin_WebCodeCam.options.resultFunction(e.data.result[0], lastImageSrc);
                } else if (e.data.finished) {
                    flipped = !flipped;
                    setTimeout(function() {
                        display.data().plugin_WebCodeCam.tryParseBarecode();
                    }, 40 * 8);
                }
            }
            qrcode.callback = function(a) {
                if (delay || camera.paused) return;
                delay = true;
                display.data().plugin_WebCodeCam.delay();
                display.data().plugin_WebCodeCam.beep();
                display.data().plugin_WebCodeCam.options.resultFunction(a, lastImageSrc);
            };
        },
        tryParseBarecode: function() {
            var flipMode = flipped == true ? "flip" : "normal";
            lastImageSrc = display[0].toDataURL();
            var dst = con.getImageData(0, 0, w, h).data;
            DecodeWorker.postMessage({
                ImageData: dst,
                Width: w,
                Height: h,
                cmd: flipMode,
                DecodeNr: 1,
                LowLight: false
            });
        },
        tryParseQRCode: function() {
            try {
                lastImageSrc = display[0].toDataURL();
                qrcode.decode();
            } catch (e) {
                setTimeout(function() {
                    display.data().plugin_WebCodeCam.tryParseQRCode();
                }, 40 * 8);
            };
        },
        delay: function() {
            display.data().plugin_WebCodeCam.cameraPlay();
        },
        cameraStop: function() {
            delay = true;
            camera.pause();
        },
        cameraStopAll: function () {
            delay = true;
            camera.pause();
            for(var i = 0; i < streams.length; i++) {
                streams[i].stop();
            }
            streams.splice(0);
        },
        cameraPlay: function() {
            delay = true;
            camera.play();
            setTimeout(function() {
                delay = false;
                if (display.data().plugin_WebCodeCam.options.ReadBarecode) display.data().plugin_WebCodeCam.tryParseBarecode();
                if (display.data().plugin_WebCodeCam.options.ReadQRCode) display.data().plugin_WebCodeCam.tryParseQRCode();
            }, 2000);
        },
        getLastImageSrc: function() {
            return lastImageSrc;
        },
        optimalZoom: function(zoom) {
            return camera.videoHeight / h;
        },
        getImageLightness: function() {
            pixels = con.getImageData(0, 0, w, h);
            var d = pixels.data;
            var colorSum = 0;
            var r, g, b, avg;
            for (var x = 0, len = d.length; x < len; x += 4) {
                r = d[x];
                g = d[x + 1];
                b = d[x + 2];
                avg = Math.floor((r + g + b) / 3);
                colorSum += avg;
            }
            return Math.floor(colorSum / (w * h));
        },
        brightness: function(pixels, adjustment) {
            adjustment = (adjustment == 0 && this.options.autoBrightnessValue != false) ? this.options.autoBrightnessValue - this.getImageLightness() : adjustment;
            var d = pixels.data;
            for (var i = 0; i < d.length; i += 4) {
                d[i] += adjustment;
                d[i + 1] += adjustment;
                d[i + 2] += adjustment;
            }
            return pixels;
        },
        grayScale: function(pixels) {
            var d = pixels.data;
            for (var i = 0; i < d.length; i += 4) {
                var r = d[i];
                var g = d[i + 1];
                var b = d[i + 2];
                var v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                d[i] = d[i + 1] = d[i + 2] = v
            }
            return pixels;
        },
        contrast: function(pixels, contrast) {
            var d = pixels.data;
            for (var i = 0; i < d.length; i += 4) {
                var contrast = 10;
                var average = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3);
                if (average > 127) {
                    d[i] += (d[i] / average) * contrast;
                    d[i + 1] += (d[i + 1] / average) * contrast;
                    d[i + 2] += (d[i + 2] / average) * contrast;
                } else {
                    d[i] -= (d[i] / average) * contrast;
                    d[i + 1] -= (d[i + 1] / average) * contrast;
                    d[i + 2] -= (d[i + 2] / average) * contrast;
                }
            }
            return pixels;
        },
        threshold: function(pixels, threshold) {
            var d = pixels.data;
            for (var i = 0, len = w * h * 4; i < len; i += 4) {
                ave = (d[i] + d[i + 1] + d[i + 2]);
                if (ave < threshold) {
                    d[i] = d[i + 1] = d[i + 2] = 0;
                } else {
                    d[i] = d[i + 1] = d[i + 2] = 255;
                }
                d[i + 3] = 255;
            }
            return pixels;
        },
        convolute: function(pixels, weights, opaque) {
            var side = Math.round(Math.sqrt(weights.length));
            var halfSide = Math.floor(side / 2);
            var src = pixels.data;
            var sw = pixels.width;
            var sh = pixels.height;
            var w = sw;
            var h = sh;
            var tmpCanvas = document.createElement('canvas');
            var tmpCtx = tmpCanvas.getContext('2d');
            var output = tmpCtx.createImageData(w, h);
            var dst = output.data;
            var alphaFac = opaque ? 1 : 0;
            for (var y = 0; y < h; y++) {
                for (var x = 0; x < w; x++) {
                    var sy = y;
                    var sx = x;
                    var dstOff = (y * w + x) * 4;
                    var r = 0,
                        g = 0,
                        b = 0,
                        a = 0;
                    for (var cy = 0; cy < side; cy++) {
                        for (var cx = 0; cx < side; cx++) {
                            var scy = sy + cy - halfSide;
                            var scx = sx + cx - halfSide;
                            if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
                                var srcOff = (scy * sw + scx) * 4;
                                var wt = weights[cy * side + cx];
                                r += src[srcOff] * wt;
                                g += src[srcOff + 1] * wt;
                                b += src[srcOff + 2] * wt;
                                a += src[srcOff + 3] * wt;
                            }
                        }
                    }
                    dst[dstOff] = r;
                    dst[dstOff + 1] = g;
                    dst[dstOff + 2] = b;
                    dst[dstOff + 3] = a + alphaFac * (255 - a);
                }
            }
            return output;
        },
        beep: function() {
            if (typeof this.options.beep != 'string') return;
            var url = this.options.beep;
            setTimeout(function() {
                new Audio(url).play();
            }, 0);
        }
    };
    $.fn[pluginName] = function(options) {
        return this.each(function() {
            if (!$.data(this, "plugin_" + pluginName)) {
                $.data(this, "plugin_" + pluginName, new Plugin(this, options));
            }
        });
    };
})(jQuery, window, document);
