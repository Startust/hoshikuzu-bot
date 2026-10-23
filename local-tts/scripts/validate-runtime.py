"""Isolated migration checks. Never imports the application's batch entrypoint."""
import argparse
import base64
import hashlib
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys
import time
import traceback

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--model-root')
parser.add_argument('--ffmpeg-bin')
parser.add_argument('--inference-only', action='store_true', help='Validate the local packaging variant and absence of optional training/UI dependencies')
args = parser.parse_args()
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
dll_handle = None
if args.ffmpeg_bin:
    ffmpeg_bin = Path(args.ffmpeg_bin).resolve()
    dll_handle = os.add_dll_directory(str(ffmpeg_bin))
    os.environ['PATH'] = str(ffmpeg_bin) + os.pathsep + os.environ.get('PATH', '')
# Eliminate service credentials and implicit credential discovery in this process.
for name in list(os.environ):
    if name.startswith(('AWS_', 'DATABASE_', 'DISCORD_', 'LOCAL_TTS_')) or name in {'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN'}:
        os.environ.pop(name)
os.environ.update({
    'HF_HUB_OFFLINE':'1', 'TRANSFORMERS_OFFLINE':'1',
    'HF_HUB_DISABLE_IMPLICIT_TOKEN':'1', 'HF_HUB_DISABLE_TELEMETRY':'1',
    'GRADIO_ANALYTICS_ENABLED':'False', 'HF_HOME':str(output/'hf-cache'),
    'TORCH_HOME':str(output/'torch-cache'), 'MODELSCOPE_CACHE':str(output/'modelscope-cache'),
    'TOKENIZERS_PARALLELISM':'false',
})
network_attempts = []
original_connect = socket.socket.connect
def no_connect(self, address):
    network_attempts.append(str(address))
    raise RuntimeError('Offline migration check forbids network connections')
socket.socket.connect = no_connect

report = {'python':sys.version,'checks':{},'networkAttempts':network_attempts}
def check(name, fn):
    start = time.monotonic()
    try:
        detail = fn()
        report['checks'][name]={'status':'passed','seconds':round(time.monotonic()-start,3),'detail':detail}
        print(name, 'passed', flush=True)
    except Exception as error:
        report['checks'][name]={'status':'failed','seconds':round(time.monotonic()-start,3),'error':str(error),'traceback':traceback.format_exc()}
        print(name, 'FAILED:', error, flush=True)
    (output/'results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def crypto():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.backends import default_backend
    from aliyunsdkcore.auth.algorithm.sha_hmac256 import get_sign_string
    import oss2
    key = rsa.generate_private_key(public_exponent=65537,key_size=2048)
    der = key.private_bytes(serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
    message='synthetic migration validation'
    signature=get_sign_string(message,base64.b64encode(der).decode())
    key.public_key().verify(base64.b64decode(signature),message.encode(),padding.PKCS1v15(),hashes.SHA256())
    cipher=AESGCM(AESGCM.generate_key(bit_length=256))
    nonce=os.urandom(12)
    encrypted=cipher.encrypt(nonce,b'fixture payload',b'fixture context')
    assert cipher.decrypt(nonce,encrypted,b'fixture context')==b'fixture payload'
    return {'cryptography':importlib.metadata.version('cryptography'),'openssl':default_backend().openssl_version_text(),'rsaConsumer':'aliyunsdkcore.auth.algorithm.sha_hmac256.get_sign_string','oss2':oss2.__version__}

check('cryptography_consumer_roundtrip',crypto)
modules = ['numpy','soundfile','pypinyin','mysql.connector','sudachipy','torch','torchaudio','torchcodec','transformers','voxcpm','fsspec','funasr','modelscope','wetext']
if not args.inference_only:
    modules += ['torchvision','gradio','datasets']
for module in modules:
    check('import_'+module,lambda module=module: {'module':module,'file':str(importlib.import_module(module).__file__)})

if args.inference_only:
    def packaging_variant():
        provenance = json.loads((Path(__file__).resolve().parents[2] / 'third_party/voxcpm/upstream.json').read_text())
        dist = importlib.metadata.distribution('voxcpm')
        assert dist.version == provenance['localVersion']
        for path, digest in provenance['sourceFiles'].items():
            actual = dist.locate_file(path.removeprefix('src/'))
            assert hashlib.sha256(actual.read_bytes()).hexdigest() == digest, path
        for optional in ['gradio', 'datasets', 'spaces']:
            try:
                importlib.metadata.distribution(optional)
            except importlib.metadata.PackageNotFoundError:
                pass
            else:
                raise AssertionError(f'Optional package installed: {optional}')
        from voxcpm import VoxCPM
        import inspect
        assert 'reference_wav_path' in inspect.signature(VoxCPM._generate).parameters
        assert callable(VoxCPM.from_pretrained) and callable(VoxCPM.generate_streaming)
        from PIL import Image
        fixture = output / 'pillow-roundtrip.png'
        Image.new('RGB', (8, 8), (12, 34, 56)).save(fixture)
        with Image.open(fixture) as decoded:
            assert decoded.getpixel((0, 0)) == (12, 34, 56)
        import fsspec
        with fsspec.open(str(output / 'fsspec-fixture.txt'), 'w') as stream:
            stream.write('isolated fixture')
        with fsspec.open(str(output / 'fsspec-fixture.txt')) as stream:
            assert stream.read() == b'isolated fixture'
        return {'version':dist.version, 'sourceFilesUnchanged':len(provenance['sourceFiles']), 'optionalPackagesAbsent':['gradio','datasets','spaces'], 'pillow':importlib.metadata.version('pillow'), 'fsspec':fsspec.__version__}
    check('inference_package_provenance_api_and_patched_io', packaging_variant)

def gpu():
    import torch
    import torchaudio
    assert torch.cuda.is_available(), 'CUDA unavailable'
    a=torch.arange(256,device='cuda',dtype=torch.float32).reshape(16,16)/256
    torch.testing.assert_close((a@a.T).cpu(),a.cpu()@a.cpu().T)
    vision_version = None
    if not args.inference_only:
        import torchvision
        vision_version = torchvision.__version__
        boxes=torch.tensor([[0,0,10,10],[1,1,9,9]],device='cuda',dtype=torch.float32)
        assert torchvision.ops.nms(boxes,torch.tensor([0.9,0.8],device='cuda'),0.5).tolist()==[0]
    wave=torch.sin(torch.arange(2400,device='cuda')*0.1)[None,:]
    resampled=torchaudio.functional.resample(wave,24000,16000)
    assert resampled.shape==(1,1600) and torch.isfinite(resampled).all()
    torch.cuda.synchronize()
    return {'torch':torch.__version__,'cuda':torch.version.cuda,'device':torch.cuda.get_device_name(),'capability':torch.cuda.get_device_capability(),'torchaudio':torchaudio.__version__,'torchvisionNmsTestedVersion':vision_version}
check('gpu_matrix_audio_resample' if args.inference_only else 'gpu_matrix_nms_audio_resample',gpu)

def audio_decode():
    import numpy as np
    import soundfile as sf
    import torchaudio
    fixture=output/'synthetic-tone.wav'
    sf.write(fixture,np.sin(np.arange(4800)*0.1)*0.05,24000)
    waveform,rate=torchaudio.load(fixture)
    assert rate==24000 and waveform.shape==(1,4800)
    return {'rate':rate,'samples':waveform.shape[-1]}
check('torchcodec_torchaudio_wav_decode',audio_decode)

if args.model_root:
    def model_inference():
        import numpy as np
        import soundfile as sf
        import torch
        from voxcpm import VoxCPM
        model=VoxCPM.from_pretrained(str(Path(args.model_root).resolve()),local_files_only=True,load_denoiser=False,optimize=False,device='cuda')
        torch.manual_seed(42)
        audio=model.generate(text='This is a local compatibility test.',inference_timesteps=16,cfg_value=1.7,normalize=False,retry_badcase=False,max_len=160)
        data=np.asarray(audio)
        rate=model.tts_model.sample_rate
        assert data.size>0 and np.isfinite(data).all()
        assert float(np.max(np.abs(data)))>1e-5
        voice=output/'synthetic-speech.wav'
        sf.write(voice,data,rate)
        # Use only our newly generated synthetic voice as the reference fixture.
        audio2=model.generate(text='测试语音。',reference_wav_path=str(voice),inference_timesteps=16,cfg_value=1.7,normalize=False,retry_badcase=False,max_len=160)
        second=np.asarray(audio2)
        assert second.size>0 and np.isfinite(second).all()
        sf.write(output/'synthetic-reference-speech.wav',second,rate)
        if args.inference_only:
            normalized = np.asarray(model.generate(text='测试 123。',reference_wav_path=str(voice),inference_timesteps=16,cfg_value=1.7,normalize=True,retry_badcase=False,max_len=160))
            assert normalized.size > 0 and np.isfinite(normalized).all() and float(np.max(np.abs(normalized))) > 1e-5
            sf.write(output/'synthetic-normalized-speech.wav',normalized,rate)
        return {'sampleRate':rate,'samples':int(data.size),'seconds':round(data.size/rate,3),'referenceSamples':int(second.size),'referenceSeconds':round(second.size/rate,3),'peak':float(np.max(np.abs(data))),'rms':float(np.sqrt(np.mean(data**2))),'maxGpuAllocated':torch.cuda.max_memory_allocated(),'sha256':hashlib.sha256(voice.read_bytes()).hexdigest(),'limits':'Synthetic text only; not a subjective speech-quality or full-batch validation.'}
    check('voxcpm_gpu_synthesis_and_reference',model_inference)

report['networkAttempts']=network_attempts
report['status']='passed' if all(c['status']=='passed' for c in report['checks'].values()) and not network_attempts else 'failed'
(output/'results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
raise SystemExit(0 if report['status']=='passed' else 1)
