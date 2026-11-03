import { useId } from "react";

const STAR_PATH = "M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z";

export default function Stars({ rating, reviews }) {
  const uid = useId().replace(/:/g, "");
  return (
    <>
      <span className="row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = rating >= i ? 1 : rating >= i - 0.5 ? 0.5 : 0;
          if (fill === 0.5) {
            const gid = `half-${uid}-${i}`;
            return (
              <svg viewBox="0 0 24 24" key={i}>
                <defs>
                  <linearGradient id={gid}>
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="#cfcfcf" />
                  </linearGradient>
                </defs>
                <path fill={`url(#${gid})`} d={STAR_PATH} />
              </svg>
            );
          }
          return (
            <svg viewBox="0 0 24 24" className={fill ? "" : "off"} key={i}>
              <path d={STAR_PATH} />
            </svg>
          );
        })}
      </span>
      <span>({reviews})</span>
      <span className="sr-only" style={{ position: "absolute", left: -9999 }}>
        {rating} out of 5 stars, {reviews} reviews
      </span>
    </>
  );
}
