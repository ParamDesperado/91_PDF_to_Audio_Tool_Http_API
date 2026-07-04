/* =========================================================
   DOM References
   ========================================================= */
const uploadZone        = document.getElementById('upload-zone');
const fileInput         = document.getElementById('pdf-upload');
const uploadContent     = document.querySelector('.upload-content');
const fileInfo          = document.getElementById('file-info');
const fileNameEl        = document.getElementById('file-name');
const fileSizeEl        = document.getElementById('file-size');
const btnRemove         = document.getElementById('btn-remove');
const btnConvert        = document.getElementById('btn-convert');
const btnText           = document.querySelector('.btn-text');
const spinner           = document.getElementById('loading-spinner');
const resultSection     = document.getElementById('result-section');
const audioPlayer       = document.getElementById('audio-player');
const downloadLink      = document.getElementById('download-link');
const errorMessage      = document.getElementById('error-message');
const nowPlayingTitle   = document.getElementById('now-playing-title');

// Audio controls
const btnPlayPause      = document.getElementById('btn-play-pause');
const btnReset          = document.getElementById('btn-reset');
const btnRewind         = document.getElementById('btn-rewind-10');
const btnForward        = document.getElementById('btn-forward-10');
const speedSelect       = document.getElementById('speed-select');
const iconPlay          = document.getElementById('icon-play');
const iconPause         = document.getElementById('icon-pause');
const seekBar           = document.getElementById('seek-bar');
const currentTimeDisplay = document.getElementById('current-time');
const durationTimeDisplay = document.getElementById('duration-time');

// Library
const catalogList       = document.getElementById('catalog-list');
const btnOpenLibrary    = document.getElementById('btn-open-library');
const btnCloseLibrary   = document.getElementById('btn-close-library');
const librarySection    = document.getElementById('library-section');

// Notice banner
const vercelNotice      = document.getElementById('vercel-notice');
const btnDismissNotice  = document.getElementById('btn-dismiss-notice');

/* =========================================================
   State
   ========================================================= */
const MAX_FILE_MB  = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

let selectedFile    = null;
let currentJobId    = null;   // track which job is playing

/* =========================================================
   Initialisation
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    loadCatalog();

    // Dismiss notice
    btnDismissNotice.addEventListener('click', () => {
        vercelNotice.classList.add('hidden');
    });
});

/* =========================================================
   Drag & Drop
   ========================================================= */
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    uploadZone.addEventListener(evt, preventDefaults, false);
    document.body.addEventListener(evt, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(evt => {
    uploadZone.addEventListener(evt, () => uploadZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(evt => {
    uploadZone.addEventListener(evt, () => uploadZone.classList.remove('dragover'), false);
});

uploadZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files) handleFiles(files);
});

fileInput.addEventListener('change', function () {
    handleFiles(this.files);
});

/* =========================================================
   File Handling
   ========================================================= */
function handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = files[0];

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        showError('Please upload a valid PDF file.');
        return;
    }

    if (file.size > MAX_FILE_BYTES) {
        showError(`File is too large (${formatBytes(file.size)}). Maximum allowed size is ${MAX_FILE_MB} MB.`);
        return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);

    uploadContent.classList.add('hidden');
    fileInfo.classList.remove('hidden');
    btnConvert.disabled = false;
    hideError();
}

btnRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';

    uploadContent.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    btnConvert.disabled = true;
    hideError();
});

/* =========================================================
   Convert
   ========================================================= */
btnConvert.addEventListener('click', async () => {
    if (!selectedFile) return;

    btnConvert.disabled = true;
    btnText.textContent = 'Processing…';
    spinner.classList.remove('hidden');
    resultSection.classList.add('hidden');
    hideError();

    if (!audioPlayer.paused) audioPlayer.pause();

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Conversion failed. Please try again.');
        }

        // Extract job_id from the URL, e.g. /api/audio/<uuid>
        currentJobId = data.job_id;
        playAudiobook(data.audio_url, selectedFile.name, data.job_id);
        loadCatalog();

    } catch (err) {
        showError(err.message || 'An unexpected error occurred.');
    } finally {
        btnConvert.disabled = false;
        btnText.textContent = 'Convert to Speech';
        spinner.classList.add('hidden');
    }
});

/* =========================================================
   Library Toggle
   ========================================================= */
btnOpenLibrary.addEventListener('click', () => {
    librarySection.classList.remove('hidden');
    librarySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

btnCloseLibrary.addEventListener('click', () => {
    librarySection.classList.add('hidden');
});

/* =========================================================
   Catalog
   ========================================================= */
async function loadCatalog() {
    try {
        const response = await fetch('/api/catalog');
        if (!response.ok) return;
        const catalog = await response.json();

        catalogList.innerHTML = '';

        if (!catalog.length) {
            catalogList.innerHTML = `<p style="color:var(--text-secondary);text-align:center;padding:0.5rem 0;">No audiobooks yet.</p>`;
            return;
        }

        catalog.forEach(item => {
            const div = document.createElement('div');
            div.className = 'catalog-item';
            div.dataset.jobId = item.job_id;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'catalog-info';
            infoDiv.setAttribute('role', 'button');
            infoDiv.setAttribute('tabindex', '0');
            infoDiv.setAttribute('aria-label', `Play ${item.filename}`);
            infoDiv.innerHTML = `<p title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</p><span>${escapeHtml(item.date)}</span>`;

            const playItem = () => {
                currentJobId = item.job_id;
                playAudiobook(item.audio_url, item.filename, item.job_id);
            };

            infoDiv.onclick = playItem;
            infoDiv.onkeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playItem();
                }
            };

            const actionGroup = document.createElement('div');
            actionGroup.className = 'catalog-action-group';

            // Rename button
            const btnRenameEl = document.createElement('button');
            btnRenameEl.className = 'btn-catalog';
            btnRenameEl.title = 'Rename';
            btnRenameEl.setAttribute('aria-label', `Rename ${item.filename}`);
            btnRenameEl.textContent = '✏️';
            btnRenameEl.onclick = async (e) => {
                e.stopPropagation();
                const newName = prompt('Enter new name:', item.filename);
                if (newName && newName.trim()) {
                    await renameAudiobook(item.job_id, newName.trim());
                }
            };

            // Delete button
            const btnDeleteEl = document.createElement('button');
            btnDeleteEl.className = 'btn-catalog';
            btnDeleteEl.title = 'Delete';
            btnDeleteEl.setAttribute('aria-label', `Delete ${item.filename}`);
            btnDeleteEl.textContent = '🗑️';
            btnDeleteEl.onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${item.filename}"? This cannot be undone.`)) {
                    await deleteAudiobook(item.job_id);
                }
            };

            actionGroup.append(btnRenameEl, btnDeleteEl);
            div.append(infoDiv, actionGroup);
            catalogList.appendChild(div);
        });

    } catch (e) {
        console.error('Failed to load catalog:', e);
    }
}

async function renameAudiobook(jobId, newName) {
    try {
        const response = await fetch(`/api/catalog/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName }),
        });
        if (response.ok) {
            loadCatalog();
        } else {
            const data = await response.json();
            alert(data.detail || 'Failed to rename.');
        }
    } catch (e) {
        console.error('Rename error:', e);
    }
}

async function deleteAudiobook(jobId) {
    try {
        const response = await fetch(`/api/catalog/${jobId}`, { method: 'DELETE' });
        if (response.ok) {
            loadCatalog();
            // Stop player if the deleted track was playing
            if (currentJobId === jobId) {
                audioPlayer.pause();
                audioPlayer.src = '';
                currentJobId = null;
                resultSection.classList.add('hidden');
            }
        } else {
            const data = await response.json();
            alert(data.detail || 'Failed to delete.');
        }
    } catch (e) {
        console.error('Delete error:', e);
    }
}

/* =========================================================
   Audio Player
   ========================================================= */
function playAudiobook(url, filename, jobId) {
    nowPlayingTitle.textContent = filename;
    audioPlayer.src = url;
    downloadLink.href = url;
    downloadLink.setAttribute('download', filename.replace(/\.pdf$/i, '.mp3'));

    audioPlayer.playbackRate = parseFloat(speedSelect.value);

    audioPlayer.onloadedmetadata = () => {
        seekBar.max = audioPlayer.duration;
        durationTimeDisplay.textContent = formatTime(audioPlayer.duration);
        updateSeekFill();
    };

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    audioPlayer.play().then(() => {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    }).catch(err => {
        console.warn('Autoplay blocked:', err);
    });
}

/* Play / Pause */
btnPlayPause.addEventListener('click', () => {
    if (!audioPlayer.src) return;
    if (audioPlayer.paused) {
        audioPlayer.play();
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    } else {
        audioPlayer.pause();
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
    }
});

/* Reset */
btnReset.addEventListener('click', () => {
    audioPlayer.currentTime = 0;
    if (audioPlayer.paused && audioPlayer.src) {
        audioPlayer.play();
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    }
});

/* Skip */
btnRewind.addEventListener('click', () => {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
});

btnForward.addEventListener('click', () => {
    if (audioPlayer.duration) {
        audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
    }
});

/* Speed */
speedSelect.addEventListener('change', (e) => {
    audioPlayer.playbackRate = parseFloat(e.target.value);
});

/* Seek bar */
audioPlayer.addEventListener('timeupdate', () => {
    seekBar.value = audioPlayer.currentTime;
    currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
    updateSeekFill();
});

seekBar.addEventListener('input', () => {
    audioPlayer.currentTime = parseFloat(seekBar.value);
    updateSeekFill();
});

/* Ended */
audioPlayer.addEventListener('ended', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    audioPlayer.currentTime = 0;
    updateSeekFill();
});

function updateSeekFill() {
    const max = parseFloat(seekBar.max) || 1;
    const val = parseFloat(seekBar.value) || 0;
    const pct = (val / max) * 100;
    seekBar.style.setProperty('--seek-fill', `${pct}%`);
}

/* =========================================================
   Keyboard Shortcut: Space = Play / Pause
   ========================================================= */
document.addEventListener('keydown', (e) => {
    // Only fire when focus is NOT on an interactive form element
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(tag)) return;

    if (e.code === 'Space' && audioPlayer.src) {
        e.preventDefault();
        btnPlayPause.click();
    }
});

/* =========================================================
   Helpers
   ========================================================= */
function formatTime(seconds) {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}
