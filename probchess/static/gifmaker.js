

class GifGenerator {
    constructor(targetDivId) {
        this.targetDiv = document.getElementById(targetDivId);
        this.gifFrames = [];
        this.gifBlob = null;
        this.observer = null;
        this.initObserver();
    }

    initObserver() {
        // Capture changes to the div
        this.observer = new MutationObserver(this.captureFrame.bind(this));
        this.observer.observe(this.targetDiv, { attributes: true, childList: true, subtree: true, characterData: true });
    }

    cancel() {
        console.log('Cancelling observer');
        this.observer.disconnect();
    }

    async captureFrame() {
        const targetMaxSize = 1000;
        // Capture the canvas of the target div
        const originalCanvas = await html2canvas(this.targetDiv, { allowTaint: true });
        
        // Calculate the aspect ratio
        const originalWidth = originalCanvas.width;
        const originalHeight = originalCanvas.height;
        const aspectRatio = originalWidth / originalHeight;
        
        // Calculate the new dimensions based on the targetMaxSize
        let targetWidth, targetHeight;
        if (originalWidth > originalHeight) {
            targetWidth = targetMaxSize;
            targetHeight = Math.floor(targetMaxSize / aspectRatio);
        } else {
            targetHeight = targetMaxSize;
            targetWidth = Math.floor(targetMaxSize * aspectRatio);
        }
        
        // Create a new canvas to resize the captured image
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetWidth;
        scaledCanvas.height = targetHeight;
        const scaledContext = scaledCanvas.getContext('2d');
        
        // Draw the captured image onto the new canvas with the calculated size
        scaledContext.drawImage(originalCanvas, 0, 0, targetWidth, targetHeight);
        
        // Get the image data from the scaled canvas
        const frame = scaledContext.getImageData(0, 0, targetWidth, targetHeight);
        this.gifFrames.push(frame);
    }
    

    generateGif() {
        const gif = new GIF({
            workers: 2,
            quality: 10,
            repeat: 0 // 0 means loop forever
        });
        console.log('Generating GIF with', this.gifFrames.length, 'frames');
        this.gifFrames.forEach(frame => {
            gif.addFrame(frame, { delay: 1000 });
        });

        gif.on('finished', blob => {
            this.gifBlob = blob;
            // Also show the gif in the page
            // const img = document.createElement('img');
            // img.src = URL.createObjectURL(blob);
            // document.body.appendChild(img);
            // Update the sharebtn to call shareGif
            const shareBtn = document.getElementById('sharebtn');
            shareBtn.onclick = this.shareGif.bind(this);
            shareBtn.classList.remove('hidden');

            // Add a download button
            const downloadBtn = document.getElementById('downloadgifbtn');
            downloadBtn.onclick = () => {
                saveAs(blob, 'animation.gif');
            };
            downloadBtn.classList.remove('hidden');
        });

        gif.render();
    }

    async shareGif() {
        if (!this.gifBlob) {
            console.error('GIF not generated yet.');
            alert('GIF not generated yet. Please try again later.');
            return;
        }
    
        const file = new File([this.gifBlob], 'animation.gif', { type: 'image/gif' });
        const data = {
            files: [file],
            text: '🎉 I just beat Stockfish at Probabilistic Chess! 🏆 Think you can do better? Try it now at marc.ai/probchess #chess #chessvariant #probchess @marcsto',
            title: '🎉 I just beat Stockfish at Probabilistic Chess! 🏆 Think you can do better? Try it now at marc.ai/probchess #chess #chessvariant #probchess @marcsto',
            url: 'https://marc.ai/probchess'
        };
        
    
        if (navigator.canShare && navigator.canShare(data)) {
            try {
                await navigator.share(data);
            } catch (err) {
                console.error('Error sharing', err);
                alert('Error sharing. Please try again.');
            }
        } else {
            alert('Your browser does not support sharing files. Please use a different browser.');
        }
    }
    

    getGifBlob() {
        return this.gifBlob;
    }
}