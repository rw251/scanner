const $scanner = document.querySelector('.scanner');
const $list = document.getElementById('list');
const $flash = document.querySelector('.flash');
const $download = document.getElementById('download');
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let newOnes = {};

$flash.addEventListener('animationend', () => {
  $flash.classList.remove('match');
});

$download.addEventListener('click', () => {
  var element = document.createElement('a');
  const data =
    'Title,Author,ISBN\n' +
    Object.entries(list)
      .map(([isbn, book]) => {
        return `${book.title.replace(/,/g, ' ')},${
          (book.author && book.author.replace(/,/g, ' ')) || 'Unknown'
        },${isbn}`;
      })
      .join('\n');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(data)
  );
  element.setAttribute(
    'download',
    `library-books-${Object.keys(list).length}.csv`
  );

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
});

$list.addEventListener('click', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.isbn) {
    deleteBook(e.target.dataset.isbn);
  }
});

function deleteBook(isbn) {
  delete list[isbn];
  displayList();
}

function beep() {
  var oscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  gainNode.gain.value = 0.5;
  oscillator.frequency.value = 1650;
  oscillator.type = 'square';

  oscillator.start();

  setTimeout(function () {
    oscillator.stop();
  }, 75);
}

let currentScanList = {};
const list = JSON.parse(localStorage.getItem('list') || '{}');
displayList();
startScanning();

function displayList() {
  $list.innerHTML = `<ul>${Object.entries(list)
    .reverse()
    .map(
      ([isbn, book]) =>
        `<li data-isbn="${isbn}" class="${
          newOnes[isbn] ? 'new' : ''
        }"><div class="title">${book.title}</div><div class="author">${
          (book.authors && book.authors.length && book.authors[0].name) ||
          'Unknown'
        }</div></li>`
    )
    .join('')}</ul>`;
  localStorage.setItem('list', JSON.stringify(list));
}

let scanFetches = 0;
let fetchReturns = 0;

function lookupISBN(isbn) {
  currentScanList[isbn] = true;
  scanFetches++;
  fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  )
    .then((response) => {
      console.log(response);
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
      const books = Object.values(x);
      if (books.length === 0) {
        console.log(`${timestamp()}Can't find ${isbn}`);
      } else {
        currentScanList = {};
        pauseScanning();
        beep();
        $flash.classList.add('match');
        const {
          authors,
          pagination,
          number_of_pages,
          publish_date,
          title,
          weight,
        } = books[0];
        list[isbn] = {
          authors,
          number_of_pages: number_of_pages || pagination,
          publish_date,
          title,
          weight,
        };
        newOnes[isbn] = true;
        displayList();
      }
    })
    .catch((err) => {
      console.log(`${timestamp}Response error`, err);
    });
}

// function getAuthors(isbn) {
//   fetch(`https://openlibrary.org${list[isbn].authors[0].key}.json`)
//     .then((x) => x.json())
//     .then((x) => x.name || x.personal_name)
//     .then((name) => {
//       list[isbn].author = name;
//       displayList();
//     });
// }
let isPaused = false;
function pauseScanning() {
  console.log(`${timestamp()}Paused`);
  isPaused = true;
  clearBoxes();
  setTimeout(() => {
    console.log(`${timestamp()}Resumed`);
    isPaused = false;
    newOnes = {};
  }, 2000);
}

function stopScanning() {
  Quagga.stop();
  $scanner.classList.remove('active');
}

function clearBoxes() {
  var drawingCtx = Quagga.canvas.ctx.overlay,
    drawingCanvas = Quagga.canvas.dom.overlay;
  drawingCtx.clearRect(
    0,
    0,
    parseInt(drawingCanvas.getAttribute('width')),
    parseInt(drawingCanvas.getAttribute('height'))
  );
}

function startScanning() {
  Quagga.init(
    {
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: document.querySelector('.scanner'),
        constraints: {
          // width: screen.width - 20,
          // height: (screen.height - 40)/2,
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

      $scanner.classList.add('active');

      $list.style.height = `${
        Math.max(
          document.documentElement.clientHeight,
          window.innerHeight || 0
        ) -
        25 -
        $scanner.offsetHeight
      }px`;
    }
  );
  Quagga.onProcessed(function (result) {
    if (isPaused) return;

    if (result) {
      var drawingCtx = Quagga.canvas.ctx.overlay;
      if (result.boxes) {
        clearBoxes();
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
    console.log(`${timestamp()}Detected ${result.codeResult.code}`);
    const isbn = result.codeResult.code;
    if (currentScanList[isbn] || isPaused) {
      console.log(`${timestamp()}Already looking up ${result.codeResult.code}`);
      return;
    }

    var countDecodedCodes = 0,
      err = 0;
    result.codeResult.decodedCodes.forEach(({ error }) => {
      if (error != undefined) {
        countDecodedCodes++;
        err += parseFloat(error);
      }
    });
    const avgError = err / countDecodedCodes;
    if (avgError < 0.15) {
      // correct code detected
      lookupISBN(isbn);
      console.log(`${timestamp()}Processed ${isbn}`, result);
    } else {
      // probably wrong code
      console.log(
        `${timestamp()}Not enough confidence for ${isbn} (error = ${avgError})`
      );
    }
  });
}

function timestamp() {
  return `${new Date().toISOString()}: `;
}
