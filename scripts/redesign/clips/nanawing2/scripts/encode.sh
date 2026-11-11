#!/usr/bin/env bash
# Encode frames/<shot>/%04d.png into out/<shot>.mp4, .webm, -poster.jpg and -contact.png.
#   encode.sh <shot> <seconds> [fade_seconds] [mp4_crf] [av1_crf] [output_name]
# With fade_seconds > 0 the renderer drew (seconds + fade) of frames; the extra tail is cross-faded
# into the head so the last frame runs straight into the first (seamless loop).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
shot="$1"; secs="$2"; fade="${3:-0}"; crf="${4:-22}"; av1crf="${5:-36}"; name="${6:-$1}"
fps=30
frames="$root/frames/$shot"
ext=png; [ -f "$frames/0000.jpg" ] && ext=jpg
out="$root/out"
mkdir -p "$out"
n=$(python3 -c "print(round($secs*$fps))")
f=$(python3 -c "print(round($fade*$fps))")
master="$out/$name-master.mkv"   # lossless RGB intermediate, deleted at the end
if [ "$f" -gt 0 ]; then
  ffmpeg -v error -y -framerate $fps -start_number "$n" -i "$frames/%04d.$ext" \
    -framerate $fps -start_number 0 -i "$frames/%04d.$ext" \
    -filter_complex "[0:v]trim=end_frame=$f,setpts=PTS-STARTPTS[b];[1:v]trim=end_frame=$n,setpts=PTS-STARTPTS[a];[b][a]xfade=transition=fade:duration=$fade:offset=0[v]" \
    -map "[v]" -c:v libx264rgb -qp 0 -preset ultrafast "$master"
else
  ffmpeg -v error -y -framerate $fps -start_number 0 -i "$frames/%04d.$ext" -frames:v "$n" \
    -c:v libx264rgb -qp 0 -preset ultrafast "$master"
fi
if [[ "$crf" == *M ]]; then
  # Size target (e.g. 2.8M = 2.8 MB): two-pass ABR, the best quality for a fixed byte budget.
  kbps=$(python3 -c "print(int(${crf%M}*8000/$secs*0.97))")
  ( cd "$out" && ffmpeg -v error -y -i "$master" -an -c:v libx264 -preset slow -b:v ${kbps}k -pass 1 \
      -passlogfile "$name-x264" -pix_fmt yuv420p -f mp4 /dev/null && \
    ffmpeg -v error -y -i "$master" -an -c:v libx264 -preset slow -b:v ${kbps}k -pass 2 \
      -passlogfile "$name-x264" -profile:v high -pix_fmt yuv420p -movflags +faststart "$out/$name.mp4" ; \
    rm -f "$name-x264"* )
else
  ffmpeg -v error -y -i "$master" -an -c:v libx264 -preset slow -crf "$crf" -profile:v high \
    -pix_fmt yuv420p -movflags +faststart "$out/$name.mp4"
fi
ffmpeg -v error -y -i "$master" -an -c:v libsvtav1 -preset 4 -crf "$av1crf" -g 300 \
  -pix_fmt yuv420p10le "$out/$name.webm"
# Poster: the first frame of the finished loop, 1920 wide; drop JPEG quality until under 200 KB.
for q in 3 4 5 6 8 10; do
  ffmpeg -v error -y -i "$master" -frames:v 1 -vf "scale=1920:-2:flags=lanczos" -q:v $q "$out/$name-poster.jpg"
  [ "$(stat -c %s "$out/$name-poster.jpg")" -lt 200000 ] && break
done
# Contact sheet: 6 evenly spaced frames, 3x2, 640 px each.
step=$(( n / 6 ))
ffmpeg -v error -y -i "$master" -vf "select='not(mod(n\,$step))',scale=640:-2:flags=lanczos,drawtext=text='%{pts\:hms}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.5,tile=3x2" \
  -frames:v 1 -fps_mode passthrough "$out/$name-contact.png" 2>/dev/null || \
ffmpeg -v error -y -i "$master" -vf "select='not(mod(n\,$step))',scale=640:-2:flags=lanczos,tile=3x2" \
  -frames:v 1 -fps_mode passthrough "$out/$name-contact.png"
[ "${KEEP_MASTER:-0}" = 1 ] || rm -f "$master"
ls -l "$out/$name".mp4 "$out/$name".webm "$out/$name-poster.jpg" "$out/$name-contact.png"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt,nb_frames:format=duration,size -of compact "$out/$name.mp4"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration,size -of compact "$out/$name.webm"
