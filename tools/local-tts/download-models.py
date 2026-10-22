"""Manual download step: official sources only; no proxy bypass or untrusted mirror."""
import argparse
import json
import os
from pathlib import Path
import ssl
import sys

parser=argparse.ArgumentParser()
parser.add_argument('--runtime-dir',required=True,type=Path)
args=parser.parse_args()
root=args.runtime_dir.resolve()
settings=json.loads(Path(__file__).with_name('settings.json').read_text(encoding='utf-8'))
os.environ['HF_HOME']=str(root/'.hf-home')
os.environ['HF_HUB_DISABLE_XET']='1'
os.environ['USE_MODELSCOPE']='false'
# Use the computer's trusted Windows certificate authorities, without disabling TLS.
if sys.platform=='win32' and not os.environ.get('REQUESTS_CA_BUNDLE'):
    certificate_file=root/'windows-ca-bundle.pem'
    certificates=ssl.create_default_context().get_ca_certs(binary_form=True)
    certificate_file.write_text(''.join(ssl.DER_cert_to_PEM_cert(cert) for cert in certificates),encoding='ascii')
    os.environ['REQUESTS_CA_BUNDLE']=str(certificate_file)
    os.environ['SSL_CERT_FILE']=str(certificate_file)
from huggingface_hub import snapshot_download,hf_hub_download

try:
    snapshot_download(settings['modelRepository'],revision=settings['modelRevision'],local_dir=root/'checkpoints',max_workers=2,token=False)
    snapshot_download('facebook/w2v-bert-2.0',local_dir=root/'checkpoints/hf_cache/w2v-bert-2.0',allow_patterns=['config.json','preprocessor_config.json','model.safetensors'],max_workers=2,token=False)
    hf_hub_download('funasr/campplus','campplus_cn_common.bin',local_dir=root/'checkpoints/hf_cache',token=False)
    snapshot_download('nvidia/bigvgan_v2_22khz_80band_256x',local_dir=root/'checkpoints/hf_cache/bigvgan',allow_patterns=['config.json','bigvgan_generator.pt'],max_workers=2,token=False)
    sys.path.insert(0,str(root))
    from indextts.utils.examples_downloader import ensure_examples_available
    ensure_examples_available()
except Exception:
    print('Download did not complete. If your security gateway blocks model downloads, obtain IT approval or provide approved local files. This script does not bypass the gateway.',file=sys.stderr)
    raise
print('Checkpoints and demo reference clips downloaded. Run start-ui.ps1 or generate.ps1.')
