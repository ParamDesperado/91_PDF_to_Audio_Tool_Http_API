const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('pdf-upload');
const uploadContent = document.querySelector('.upload-content');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const btnRemove = document.getElementById('btn-remove');
const btnConvert = document.getElementById('btn-convert');
const btnText = document.querySelector('.btn-text');
const spinner = document.getElementById('loading-spinner');
const resultSection = document.getElementById('result-section');
const audioPlayer = document.getElementById('audio-player');
const downloadLink = document.getElementById('download-link');
const errorMessage = document.getElementById('error-message');
const nowPlayingTitle = document.getElementById('now-playing-title');

// Custom Audio Control elements
const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const btnRewind = document.getElementById('btn-rewind-10');
const btnForward = document.getElementById('btn-forward-10');
const speedSelect = document.getElementById('speed-select');

const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const seekBar = document.getElementById('seek-bar');
const currentTimeDisplay = document.getElementById('current-time');
const durationTimeDisplay = document.getElementById('duration-time');

// Library Management
const catalogList = document.getElementById('catalog-list');
const btnOpenLibrary = document.getElementById('btn-open-library');
const btnCloseLibrary = document.getElementById('btn-close-library');
const librarySection = document.getElementById('library-section');

let selectedFile = null;

// Initial Load
document.addEventListener("DOMContentLoaded", loadCatalog);

// Drag and Drop handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
        uploadZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
        uploadZone.classList.remove('dragover');
    }, false);
});

uploadZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
});

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            showError('Please upload a valid PDF file.');
            return;
        }
        
        selectedFile = file;
        fileName.textContent = file.name;
        
        uploadContent.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        btnConvert.disabled = false;
        hideError();
    }
}

btnRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    
    uploadContent.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    btnConvert.disabled = true;
    hideError();
});

btnConvert.addEventListener('click', async () => {
    if (!selectedFile) return;

    btnConvert.disabled = true;
    btnText.textContent = 'Processing...';
    spinner.classList.remove('hidden');
    resultSection.classList.add('hidden');
    hideError();
    
    audioPlayer.pause();

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Failed to convert PDF.');
        }

        playAudiobook(data.audio_url, selectedFile.name);
        loadCatalog();

    } catch (error) {
        showError(error.message);
    } finally {
        btnConvert.disabled = false;
        btnText.textContent = 'Convert to Speech';
        spinner.classList.add('hidden');
    }
});

// Library Toggle
btnOpenLibrary.addEventListener('click', () => {
    librarySection.classList.remove('hidden');
    librarySection.scrollIntoView({ behavior: 'smooth' });
});

btnCloseLibrary.addEventListener('click', () => {
    librarySection.classList.add('hidden');
});

// Catalog Logic
async function loadCatalog() {
    try {
        const response = await fetch('/api/catalog');
        if (!response.ok) return;
        const catalog = await response.json();
        
        catalogList.innerHTML = "";
        
        if (catalog.length === 0) {
            catalogList.innerHTML = "<p style='color: var(--text-secondary); text-align: center;'>No audiobooks yet.</p>";
            return;
        }

        catalog.forEach(item => {
            const div = document.createElement("div");
            div.className = "catalog-item";
            
            const infoDiv = document.createElement("div");
            infoDiv.className = "catalog-info";
            infoDiv.innerHTML = `
                <p>${item.filename}</p>
                <span>${item.date}</span>
            `;
            infoDiv.onclick = () => playAudiobook(item.audio_url, item.filename);

            const actionGroup = document.createElement("div");
            actionGroup.className = "catalog-action-group";

            const btnRename = document.createElement("button");
            btnRename.className = "btn-catalog";
            btnRename.title = "Rename";
            btnRename.textContent = "✏️";
            btnRename.onclick = async (e) => {
                e.stopPropagation();
                const newName = prompt("Enter new name for audiobook:", item.filename);
                if (newName && newName.trim() !== "") {
                    await renameAudiobook(item.job_id, newName.trim());
                }
            };

            const btnDelete = document.createElement("button");
            btnDelete.className = "btn-catalog";
            btnDelete.title = "Delete";
            btnDelete.textContent = "🗑️";
            btnDelete.onclick = async (e) => {
                e.stopPropagation();
                const confirmDelete = confirm("Are you sure you want to permanently delete this audiobook?");
                if (confirmDelete) {
                    await deleteAudiobook(item.job_id);
                }
            };

            actionGroup.appendChild(btnRename);
            actionGroup.appendChild(btnDelete);

            div.appendChild(infoDiv);
            div.appendChild(actionGroup);
            
            catalogList.appendChild(div);
        });

    } catch (e) {
        console.error("Failed to load catalog", e);
    }
}

async function renameAudiobook(jobId, newName) {
    try {
        const response = await fetch(`/api/catalog/${jobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName })
        });
        if (response.ok) {
            loadCatalog();
        } else {
            alert("Failed to rename.");
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteAudiobook(jobId) {
    try {
        const response = await fetch(`/api/catalog/${jobId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            loadCatalog();
            // If deleting currently playing, stop it
            if (audioPlayer.src.includes(jobId)) {
                audioPlayer.pause();
                resultSection.classList.add('hidden');
            }
        } else {
            alert("Failed to delete.");
        }
    } catch (e) {
        console.error(e);
    }
}

function playAudiobook(url, filename) {
    nowPlayingTitle.textContent = filename;
    audioPlayer.src = url;
    downloadLink.href = url;
    downloadLink.setAttribute("download", filename.replace(".pdf", ".mp3"));
    
    // Sync speed immediately
    audioPlayer.playbackRate = parseFloat(speedSelect.value);
    
    // Wait for metadata to load to get duration
    audioPlayer.onloadedmetadata = () => {
        seekBar.max = audioPlayer.duration;
        durationTimeDisplay.textContent = formatTime(audioPlayer.duration);
    };
    
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
    
    // Auto-play
    audioPlayer.play();
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
}


// Custom Audio Controls Logic
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

btnReset.addEventListener('click', () => {
    audioPlayer.currentTime = 0;
    if (audioPlayer.paused) {
        audioPlayer.play();
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    }
});

btnRewind.addEventListener('click', () => {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
});

btnForward.addEventListener('click', () => {
    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
});

speedSelect.addEventListener('change', (e) => {
    audioPlayer.playbackRate = parseFloat(e.target.value);
});

audioPlayer.addEventListener('timeupdate', () => {
    seekBar.value = audioPlayer.currentTime;
    currentTimeDisplay.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener('ended', () => {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    audioPlayer.currentTime = 0;
});

seekBar.addEventListener('input', () => {
    audioPlayer.currentTime = seekBar.value;
});

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}
