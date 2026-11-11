#!/usr/bin/env bash
# Round 2 encoder. frames/<shot>/%04d.png -> out2/<name>.mp4 (H.264 two-pass to a size), .webm (AV1
# 10-bit VBR to a size), -poster.webp (first frame, q80) and -contact.jpg (6 frames).
#   encode2.sh <shot> <seconds> <fade_seconds> <mp4_MB> <webm_MB> [name]
# With fade > 0 the renderer drew (seconds + fade); the tail is cross-faded into the head so the last
# frame runs straight into the first (seamless loop).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
shot="$1"; secs="$2"; fade="$3"; mp4mb="$4"; webmmb="$5"; name="${6:-$1}"
fps=30
frames="$root/frames/$shot"
out="$root/out2"
mkdir -p "$out"
n=$(python3 -c "print(round($secs*$fps))")
f=$(python3 -c "print(round($fade*$fps))")
master="$out/$name-master.mkv"
if [ "$f" -gt 0 ]; then
  ffmpeg -v error -y -framerate $fps -start_number "$n" -i "$frames/%04d.png" \
    -framerate $fps -start_number 0 -i "$frames/%04d.png" \
    -filter_complex "[0:v]trim=end_frame=$f,setpts=PTS-STARTPTS[b];[1:v]trim=end_frame=$n,setpts=PTS-STARTPTS[a];[b][a]xfade=transition=fade:duration=$fade:offset=0[v]" \
    -map "[v]" -c:v libx264rgb -qp 0 -preset ultrafast "$master"
  if [ "${ROTATE:-0}" = 1 ]; then
    # Start on a clean head frame and put the dissolve at the end (still seamless; better poster).
    ffmpeg -v error -y -i "$master" -filter_complex "[0:v]split[x][y];[x]trim=start_frame=$f,setpts=PTS-STARTPTS[a];[y]trim=end_frame=$f,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[v]" \
      -map "[v]" -c:v libx264rgb -qp 0 -preset ultrafast "$master.rot.mkv" && mv "$master.rot.mkv" "$master"
  fi
else
  ffmpeg -v error -y -framerate $fps -start_number 0 -i "$frames/%04d.png" -frames:v "$n" \
    -c:v libx264rgb -qp 0 -preset ultrafast "$master"
fi
# H.264: two-pass ABR to the byte budget (mux overhead and rate error leave ~4% headroom).
kbps=$(python3 -c "print(int($mp4mb*8000/$secs*0.95))")
( cd "$out" && ffmpeg -v error -y -i "$master" -an -c:v libx264 -preset slow -b:v ${kbps}k -pass 1 \
    -passlogfile "$name-x264" -pix_fmt yuv420p -f mp4 /dev/null && \
  ffmpeg -v error -y -i "$master" -an -c:v libx264 -preset slow -b:v ${kbps}k -pass 2 \
    -passlogfile "$name-x264" -profile:v high -pix_fmt yuv420p -movflags +faststart "$out/$name.mp4"; \
  rm -f "$name-x264"* )
# AV1: VBR to the budget; step the rate down until it fits.
limit=$(python3 -c "print(int($webmmb*1000000))")
for k in 0.92 0.80 0.68 0.56; do
  akbps=$(python3 -c "print(int($webmmb*8000/$secs*$k))")
  ffmpeg -v error -y -i "$master" -an -c:v libsvtav1 -preset 5 -b:v ${akbps}k -g 300 \
    -pix_fmt yuv420p10le "$out/$name.webm"
  [ "$(stat -c %s "$out/$name.webm")" -le "$limit" ] && break
done
ffmpeg -v error -y -i "$master" -frames:v 1 -c:v libwebp -quality 80 "$out/$name-poster.webp"
w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$master")
h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$master")
step=$(( n / 6 ))
if [ "$w" -ge "$h" ]; then tile="scale=640:-2,tile=3x2"; else tile="scale=-2:640,tile=6x1"; fi
ffmpeg -v error -y -i "$master" -vf "select='not(mod(n\,$step))',$tile" -frames:v 1 -fps_mode passthrough -q:v 3 "$out/$name-contact.jpg"
rm -f "$master"
for x in "$name.mp4" "$name.webm" "$name-poster.webp" "$name-contact.jpg"; do printf '%9d  %s\n' "$(stat -c %s "$out/$x")" "$out/$x"; done
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration -of compact "$out/$name.mp4"
ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,pix_fmt:format=duration -of compact "$out/$name.webm"
