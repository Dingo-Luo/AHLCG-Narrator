"""Produce one indexed Mandarin sample locally; keep site audio approvals unchanged."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import time
from datetime import datetime,timezone
from preflight import missing_files

parser=argparse.ArgumentParser()
parser.add_argument('--runtime-dir',required=True,type=Path)
parser.add_argument('--id',default='2-0-0-1-1')
parser.add_argument('--reference',type=Path)
parser.add_argument('--emotion-text')
parser.add_argument('--force',action='store_true')
parser.add_argument('--check-only',action='store_true')
args=parser.parse_args()
project=Path(__file__).resolve().parents[2]
runtime=args.runtime_dir.resolve()
manifest=json.loads((project/'data/narration/index.json').read_text(encoding='utf-8'))
unit=next((unit for unit in manifest['units'] if unit['id']==args.id),None)
if not unit or not unit['speak']:raise SystemExit('Unknown ID or this paragraph is excluded from narration.')
if hashlib.sha256(unit['text'].encode()).hexdigest()!=unit['textHash']:raise SystemExit('Text hash does not match; rebuild the narration index.')
source=next(source for source in manifest['sources'] if source['key']==unit['sourceKey'])
reference=(args.reference or runtime/'examples/voice_04.wav').resolve()
relative=Path(unit['audioPath']).parent/'indextts'/Path(unit['audioPath']).name
output=project/relative
wave_output=output.with_suffix('.wav')
metadata_path=project/'data/narration/samples'/f'{unit["id"]}.indextts.json'
if args.check_only:
    print(json.dumps({'id':unit['id'],'characters':len(unit['text']),'runtime':str(runtime),'reference':str(reference),'output':str(output),'speed':1.0,'missing':missing_files(runtime,emotion=bool(args.emotion_text))},ensure_ascii=False,indent=2))
    raise SystemExit(0)
missing=missing_files(runtime,emotion=bool(args.emotion_text))
if missing:raise SystemExit('Missing local checkpoints:\n'+'\n'.join(missing))
if not reference.is_file():raise SystemExit(f'Reference clip not found: {reference}')
if not args.force and any(file.exists() for file in [output,wave_output,metadata_path]):raise SystemExit('A sample already exists. Use --force only when intentionally replacing it.')
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['USE_MODELSCOPE']='false'
os.environ['HF_HOME']=str(runtime/'.hf-home')
os.chdir(runtime)
sys.path.insert(0,str(runtime))
import numpy as np
import torch
import soundfile as sf
import imageio_ffmpeg
from indextts.infer_v2_5 import IndexTTS2
if not torch.cuda.is_available():raise SystemExit('No working CUDA GPU was detected. Check the PyTorch and NVIDIA driver setup.')
random.seed(1234);np.random.seed(1234);torch.manual_seed(1234)
tts=IndexTTS2(cfg_path='checkpoints/config.yaml',model_dir='checkpoints',device='cuda:0',use_bf16=torch.cuda.is_bf16_supported(),use_cuda_kernel=False,use_deepspeed=False,use_qwen_emo=bool(args.emotion_text))
output.parent.mkdir(parents=True,exist_ok=True)
started=time.perf_counter()
options=dict(spk_audio_prompt=str(reference),text=unit['text'],lang='ZH',output_path=str(wave_output),duration_factor=1.0,use_random=False,verbose=True)
if args.emotion_text:options.update(use_emo_text=True,emo_text=args.emotion_text,emo_alpha=0.35)
tts.infer(**options)
if not wave_output.is_file():raise SystemExit('IndexTTS did not produce a WAV file.')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-nostdin','-hide_banner','-loglevel','error','-y','-i',str(wave_output),'-codec:a','libmp3lame','-q:a','2',str(output)],check=True)
metadata={'id':unit['id'],'provider':'Local IndexTTS','model':'IndexTTS-2.5','textHash':unit['textHash'],'text':unit['text'],'src':relative.as_posix(),'status':'draft','durationFactor':1.0,'durationSeconds':sf.info(wave_output).duration,'generationSeconds':round(time.perf_counter()-started,2),'reference':str(reference),'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'emotionText':args.emotion_text,'emotionAlpha':0.35 if args.emotion_text else None,'spokenWatermark':False,'generatedAt':datetime.now(timezone.utc).isoformat()}
metadata_path.parent.mkdir(parents=True,exist_ok=True)
metadata_path.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Generated MP3:',output)
print('WAV master:',wave_output)
print('Review metadata:',metadata_path)
print('The site audio approval mapping was not changed. Audition before marking ready.')
