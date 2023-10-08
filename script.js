const $start = document.getElementById('start');
const $stop = document.getElementById('stop');
const $scanner = document.querySelector('.scanner');
const $list = document.getElementById('list');

$list.addEventListener('click', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.isbn) {
    console.log(e.target.dataset.isbn);
    deleteBook(e.target.dataset.isbn);
  }
});

function deleteBook(isbn) {
  delete list[isbn];
  displayList();
}

const currentScanList = {};
const list = JSON.parse(localStorage.getItem('list') || '{}');
displayList();

// startScanning();
let isScanning = false;
$start.addEventListener('click', (e) => {
  if (isScanning) {
    stopScanning();
  } else {
    startScanning();
  }
});

$stop.addEventListener('click', (e) => {
  stopScanning();
});

function displayList() {
  $list.innerHTML = `<ul>${Object.entries(list)
    .map(
      ([isbn, book]) =>
        `<li data-isbn="${isbn}"><div class="title">${
          book.title
        }</div><div class="author">${book.author || 'Loading...'}</div></li>`
    )
    .join('')}</ul>`;
  localStorage.setItem('list', JSON.stringify(list));
}

let scanFetches = 0;
let fetchReturns = 0;

function lookupISBN(isbn) {
  currentScanList[isbn] = true;
  scanFetches++;
  fetch(`https://openlibrary.org/isbn/${isbn}.json`)
    .then((response) => {
      if (!response.ok) {
        return {
          json: () => {
            return { book: true };
          },
        };
      }
      return response;
    })
    .then((x) => x.json())
    .then((x) => {
      if (x.book && x.book === true) return;
      currentScanList[isbn] = x;
      stopScanning();
      list[isbn] = x;
      displayList();
      getAuthors(isbn);
    });
}

function getAuthors(isbn) {
  fetch(`https://openlibrary.org${list[isbn].authors[0].key}.json`)
    .then((x) => x.json())
    .then((x) => x.name || x.personal_name)
    .then((name) => {
      list[isbn].author = name;
      displayList();
    });
}

function stopScanning() {
  $stop.classList.remove('active');
  $start.classList.add('active');
  Quagga.stop();
  $scanner.classList.remove('active');
  isScanning = false;
}

function startScanning() {
  $stop.classList.add('active');
  $start.classList.remove('active');
  Quagga.init(
    {
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: document.querySelector('.scanner'),
        constraints: {
          width: 480,
          height: 480,
          facingMode: 'environment',
        },
      },
      decoder: {
        readers: ['ean_reader'],
        debug: {
          showCanvas: true,
          showPatches: true,
          showFoundPatches: true,
          showSkeleton: true,
          showLabels: true,
          showPatchLabels: true,
          showRemainingPatchLabels: true,
          boxFromPatches: {
            showTransformed: true,
            showTransformedBox: true,
            showBB: true,
          },
        },
      },
    },
    function (err) {
      if (err) {
        console.log(err);
        return;
      }

      console.log('Initialization finished. Ready to start');
      Quagga.start();

      // Set flag to is running
      isScanning = true;
      $scanner.classList.add('active');
    }
  );
  Quagga.onProcessed(function (result) {
    var drawingCtx = Quagga.canvas.ctx.overlay,
      drawingCanvas = Quagga.canvas.dom.overlay;

    if (result) {
      if (result.boxes) {
        drawingCtx.clearRect(
          0,
          0,
          parseInt(drawingCanvas.getAttribute('width')),
          parseInt(drawingCanvas.getAttribute('height'))
        );
        result.boxes
          .filter(function (box) {
            return box !== result.box;
          })
          .forEach(function (box) {
            Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
              color: 'green',
              lineWidth: 2,
            });
          });
      }

      if (result.box) {
        Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
          color: '#00F',
          lineWidth: 2,
        });
      }

      if (result.codeResult && result.codeResult.code) {
        Quagga.ImageDebug.drawPath(
          result.line,
          { x: 'x', y: 'y' },
          drawingCtx,
          { color: 'red', lineWidth: 3 }
        );
      }
    }
  });

  Quagga.onDetected(function (result) {
    const isbn = result.codeResult.code;
    if (currentScanList[isbn]) return;

    var countDecodedCodes = 0,
      err = 0;
    result.codeResult.decodedCodes.forEach(({ error }) => {
      if (error != undefined) {
        countDecodedCodes++;
        err += parseFloat(error);
      }
    });
    const avgError = err / countDecodedCodes;
    if (avgError < 0.1) {
      // correct code detected
      lookupISBN(isbn);
      console.log(
        'Barcode detected and processed : [' + result.codeResult.code + ']',
        result
      );
    } else {
      // probably wrong code
      console.log(isbn, 'ERROR', avgError);
    }
  });
}
