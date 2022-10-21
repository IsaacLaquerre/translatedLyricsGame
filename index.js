require("dotenv").config();
const express = require("express");
const fetch = require("fetch").fetchUrl;
const Genius = require("genius-lyrics");

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_AUTH_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH_ENDPOINT = "https://api.spotify.com/v1/search";
const SPOTIFY_ARTIST_ENDPOINT = "https://api.spotify.com/v1/artists";
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
const GENIUS_SEARCH_ENDPOINT = "https://api.genius.com/search"
const GENIUS_SONG_ENDPOINT = "https://api.genius.com/songs"
const TRANSLATE_ENPOINT = "https://libretranslate.de/translate";

var spotify_token = "";
var geniusClient = new Genius.Client(GENIUS_ACCESS_TOKEN);

var selectedLanguage = "fr";

var app = express();
var router = express.Router();

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(router);
app.use(express.static(__dirname + "/public"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "ejs");
app.set("views", __dirname + "/public/views/");

app.listen(
    PORT,
    () => console.log("App live and listening on port " + PORT)
);

app.get("/newround", (req, res) => {
    if (!req.query || !req.query.genre) return res.redirect("/");
    getSpotifyToken().then(async token => {
        spotify_token = token;
    
        return setupRound(req.query.genre).then(data => res.send({
            status: "ok",
            data: {
                lyrics: data.lyrics,
                answers: data.answers
            }
        })).catch(err => res.send({
            status: "error",
            error: err
        }));
    });
});

router.get("/", (req, res) => {
    return res.render("index.ejs", { root: "views" });
});

/*app.get("*", (req, res) => {
    return res.render("404.html", { root: "views" });
});*/

async function setupRound(genre) {
    return new Promise((resolve, reject) => {
        try {
            getArtist(genre).then(res => {
                var artist = res.artists.items[Math.floor(Math.random() * res.artists.items.length)];
    
                getRandomSongFromArtist(artist.id).then(res => {
                    var hit = res.response.hits.filter(hit => hit.result.artist_names.includes(artist.name))[0];
    
                    if (hit === undefined) return setupRound(genre);
                    else hit = hit.result;
    
                    var song = { id: hit.id, imageUrl: hit.song_art_image_url, title: hit.title, artist: { id: hit.primary_artist.id, imageUrl: hit.primary_artist.image_url, name: hit.primary_artist.name } };
                    if (hit.featured_artists.length != 0) {
                        song.featured = [];
                        for (i in hit.featured_artists) {
                            song.featured.push({ id: hit.featured_artists[i].id, imageUrl: hit.featured_artists[i].image_url, name: hit.featured_artists[i].name });
                        }
                    }
    
                    getLyrics(song.id).then(async lyrics => {
                        var maxLines = 8;
                        var lines = lyrics.split("\n").filter(verse => {
                            if (verse.charAt(0) === " ") verse = verse.substring(1, verse.length);
                            verse = verse.trim();
                            return !verse.includes("[") && !verse.includes("]") && verse != "";
                        });
                        var randomIndex = Math.max(1, Math.floor(Math.random() * lines.length - maxLines));
                        lines = lines.slice(randomIndex, randomIndex + maxLines);
                        var translated = await translate(lines.join("\n")).then(translatedLines => { return { language: translatedLines.detectedLanguage.language, lines: translatedLines.translatedText.split("\n") } });
                        translated = await untranslate(translated.lines.join("\n"), translated.language).then(translatedLines => { return { lines: translatedLines.translatedText.split("\n")} });
                        var data = {
                            lyrics: translated.lines,
                            answers: {
                                imageUrl: song.imageUrl,
                                title: song.title,
                                artist: {
                                    imageUrl: song.artist.imageUrl,
                                    name: song.artist.name
                                },
                                lyrics: lines
                            }
                        };
                        if (song.featured != 0) {
                            data.featured = [];
                            for (i in song.featured) {
                                data.featured.push({ imageUrl: song.featured[i].image_url, name: song.featured[i].name });
                            }
                        }
                        resolve(data);
                    }).catch(err => {
                        console.log(err);
                        return setupRound(genre);
                    });
                }).catch(err => {
                    console.log(err);
                    return setupRound(genre);
                });
            });
        } catch (err) {
            console.log(err);
            return setupRound(genre);
        }
    });
}

function getSpotifyToken() {
    return new Promise((resolve, reject) => {
        fetch(SPOTIFY_AUTH_ENDPOINT + "?grant_type=client_credentials", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": "Basic " + btoa(SPOTIFY_CLIENT_ID + ":" + SPOTIFY_CLIENT_SECRET)
            }
        }, (err, meta, body) => {
            if (err) reject(err);
            else resolve(JSON.parse(body.toString()).access_token);
        })
    });
}

function getArtist(genre) {
    return new Promise((resolve, reject) => {
        var params = "?query=" + getRandomQuery() + "%20" + "genre:" + genre.replace(/ /g, "-") + "&type=artist&limit=10";
        fetch(SPOTIFY_SEARCH_ENDPOINT + params, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + spotify_token
            }
        }, (err, meta, body) => {
            if (err) reject(err);
            else resolve(JSON.parse(body.toString()));
        });
    });
}

function getRandomQuery() {
    var characters = "abcdefghijklmnopqrstuvwxyz1234567890";
  
    return characters.charAt(Math.floor(Math.random() * characters.length));
}

function getRandomSongFromArtist(id) {
    return new Promise((resolve, reject) => {
        fetch(SPOTIFY_ARTIST_ENDPOINT + "/" + id + "/top-tracks?market=US", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + spotify_token
            }
        }, (err, meta, body) => {
            if (err) reject(err);
            else {
                var res = JSON.parse(body.toString());
                var tracks = [];
                for (i in res.tracks) {
                    tracks.push({ title: res.tracks[i].name, artist: res.tracks[i].artists[0].name });
                }

                var track = tracks[Math.floor(Math.random() * tracks.length)];

                var params = "?" + new URLSearchParams([["q", track.title + " " + track.artist]]);
                fetch(GENIUS_SEARCH_ENDPOINT + params, {
                    method: "GET",
                    headers: {
                        "Authorization": "Bearer " + GENIUS_ACCESS_TOKEN
                    }
                }, (err, meta, body) => {
                    if (err) reject(err);
                    else resolve(JSON.parse(body.toString()));
                })
            }
        });
    });
}

function getLyrics(songId) {
    return new Promise((resolve, reject) => {
        geniusClient.songs.get(songId).then(song => {
            return song.lyrics().then(lyrics => {
                resolve(lyrics);
            }).catch(err => reject(err));
        }).catch(err => reject(err));
    });
}

function translate(query) {
    return new Promise((resolve, reject) => {
        var params = "?" + new URLSearchParams([["q", query], ["source", "auto"], ["target", selectedLanguage]]);
        fetch(TRANSLATE_ENPOINT + params, {
            method: "POST"
        }, (err, meta, body) => {
            if (err) reject(err);
            else resolve(JSON.parse(body.toString()));
        });
    });
}

function untranslate(query, language) {
    return new Promise((resolve, reject) => {
        var params = "?" + new URLSearchParams([["q", query], ["source", selectedLanguage], ["target", language]]);
        fetch(TRANSLATE_ENPOINT + params, {
            method: "POST"
        }, (err, meta, body) => {
            if (err) reject(err);
            else resolve(JSON.parse(body.toString()));
        });
    });
}