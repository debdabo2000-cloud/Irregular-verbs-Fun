const WorkbenchOCR = (() => {
  let loading;
  function loadOCR() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.integrity = 'sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        script.remove();
        reject(new Error('OCR failed to load'));
      };
      document.head.append(script);
    });
  }

  async function read(photo, onProgress) {
    loading ??= loadOCR().catch(error => {
      loading = undefined;
      throw error;
    });
    const ocr = await loading;
    const worker = await ocr.createWorker(['eng', 'chi_tra'], 1, {
      logger: ({ status, progress }) => {
        if (status === 'recognizing text') onProgress(Math.round(progress * 100));
      }
    });
    try {
      const { data } = await worker.recognize(photo);
      return data.text.trim();
    } finally {
      await worker.terminate();
    }
  }

  return { read };
})();
