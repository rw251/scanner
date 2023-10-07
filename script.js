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
    .map(([isbn, book]) => `<li data-isbn="${isbn}">${book.title}</li>`)
    .join('')}</ul>`;
  localStorage.setItem('list', JSON.stringify(list));
}

function lookupISBN(isbn) {
  list[isbn] = true;
  fetch(`https://openlibrary.org/isbn/${isbn}.json`)
    .then((x) => x.json())
    .then((x) => {
      list[isbn] = x;
      displayList();
      console.log(x);
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
        //   {
        //     format: "ean_reader",
        //     config: {
        //       supplements: ["ean_5_reader", "ean_2_reader"],
        //     },
        //   },
        // ],
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
    if (list[isbn]) return;
    lookupISBN(isbn);
    stopScanning();
    console.log(
      'Barcode detected and processed : [' + result.codeResult.code + ']',
      result
    );
  });
}
