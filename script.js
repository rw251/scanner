const $scanner = document.querySelector('.scanner');
const $list = document.getElementById('list');
const $flash = document.querySelector('.flash');
const $download = document.getElementById('download');

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

let currentScanList = {};
const list = JSON.parse(localStorage.getItem('list') || '{}');
displayList();
startScanning();

function displayList() {
  $list.innerHTML = `<ul>${Object.entries(list)
    .reverse()
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
      currentScanList = {};
      pauseScanning();
      $flash.classList.add('match');
      const { authors, number_of_pages, publish_date, title, weight } = x;
      list[isbn] = {
        authors,
        number_of_pages,
        publish_date,
        title,
        weight,
      };
      displayList();
      if (list[isbn].authors) getAuthors(isbn);
      else if (x.works) {
        fetch(`https://openlibrary.org${x.works[0].key}.json`)
          .then((x) => x.json())
          .then((work) => {
            if (work.authors) list[isbn].authors = [work.authors[0].author];
            getAuthors(isbn);
          });
      }
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
let isPaused = false;
function pauseScanning() {
  isPaused = true;
  clearBoxes();
  setTimeout(() => {
    isPaused = false;
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
