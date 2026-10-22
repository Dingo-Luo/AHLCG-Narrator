import argparse
from pathlib import Path

REQUIRED=[
 'checkpoints/config.yaml','checkpoints/gpt.pth','checkpoints/codec.pth',
 'checkpoints/s2mel.pth','checkpoints/feat1.pt','checkpoints/feat2.pt',
 'checkpoints/wav2vec2bert_stats.pt','checkpoints/multilingual_zh_ja_yue_char_del.tiktoken',
 'checkpoints/hf_cache/w2v-bert-2.0/config.json',
 'checkpoints/hf_cache/w2v-bert-2.0/preprocessor_config.json',
 'checkpoints/hf_cache/campplus_cn_common.bin',
 'checkpoints/hf_cache/bigvgan/config.json','checkpoints/hf_cache/bigvgan/bigvgan_generator.pt',
]
def missing_files(root,emotion=False,examples=False):
    missing=[file for file in REQUIRED if not (root/file).is_file()]
    if not any((root/'checkpoints/hf_cache/w2v-bert-2.0'/name).is_file() for name in ['model.safetensors','pytorch_model.bin']):
        missing.append('checkpoints/hf_cache/w2v-bert-2.0/model.safetensors (or pytorch_model.bin)')
    if emotion:
        for file in ['config.json','model.safetensors','tokenizer.json','tokenizer_config.json']:
            if not (root/'checkpoints/qwen0.6bemo4-merge'/file).is_file():missing.append('checkpoints/qwen0.6bemo4-merge/'+file)
    if examples and not (root/'examples/voice_04.wav').is_file():missing.append('examples/voice_04.wav (bundled demo reference)')
    return missing
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--runtime-dir',required=True,type=Path)
    args=parser.parse_args();missing=missing_files(args.runtime_dir,emotion=True,examples=True)
    if missing:
        print('Missing local files:\n'+'\n'.join(' - '+file for file in missing));raise SystemExit(1)
    print('Required checkpoints, emotion model and demo reference are present.')
