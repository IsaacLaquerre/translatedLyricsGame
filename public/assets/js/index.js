var genre = "pop";

function fetchLyrics() {
    return new Promise((resolve, reject) => {
        fetch("/newround?genre=" + genre).then(body => body.json().then(res => {
            if (res.status === "ok") resolve(res.data);
            else if (res.status === "error") reject(res.error);
        }));
    });
}

function setUpLyrics(lyrics) {
    console.log(lyrics);

    var lyricsElement = document.querySelector("#lyrics");

    for (i in lyrics) {
        var lyricLine = document.createElement("div");
        lyricLine.classList.add("lyricLine");
        lyricLine.innerHTML = lyrics[i];
        lyricsElement.appendChild(lyricLine);
    }
}