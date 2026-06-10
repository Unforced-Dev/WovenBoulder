/**
 * Click-to-load YouTube facade: no third-party iframe until the visitor
 * asks for it (fast first paint, no YouTube cookies on page load).
 * Always pairs with a plain external link for keyboard/screen-reader
 * users who prefer YouTube itself.
 */
import { useState } from "react";
import { youtubeVideoId } from "../lib/format.ts";

export function YouTubeEmbed(props: { url: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const videoId = youtubeVideoId(props.url);

  return (
    <div className="recording">
      <a className="btn-youtube" href={props.url} target="_blank" rel="noopener noreferrer">
        Watch on YouTube ↗
      </a>
      {videoId !== null && (
        <div className="video-frame">
          {loaded ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
              title={`Recording: ${props.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="video-facade"
              onClick={() => setLoaded(true)}
              style={{
                backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`,
              }}
            >
              <span className="video-facade-play" aria-hidden="true">
                ▶
              </span>
              <span className="visually-hidden">Play recording: {props.title}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
