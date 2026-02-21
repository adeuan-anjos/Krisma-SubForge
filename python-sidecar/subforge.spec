# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec para SubForge Python Sidecar.
Build: pyinstaller subforge.spec --onedir
"""
import os
import sys
from PyInstaller.utils.hooks import collect_all

# Coletar dados das bibliotecas principais
datas = []
binaries = []
hiddenimports = []

# MFA
try:
    _mfa_datas, _mfa_bins, _mfa_hidden = collect_all('montreal_forced_aligner')
    datas += _mfa_datas
    binaries += _mfa_bins
    hiddenimports += _mfa_hidden
except Exception:
    pass

# google-genai
try:
    _genai_datas, _genai_bins, _genai_hidden = collect_all('google.genai')
    datas += _genai_datas
    binaries += _genai_bins
    hiddenimports += _genai_hidden
except Exception:
    pass

# audio-separator
try:
    _sep_datas, _sep_bins, _sep_hidden = collect_all('audio_separator')
    datas += _sep_datas
    binaries += _sep_bins
    hiddenimports += _sep_hidden
except Exception:
    pass

# onnxruntime
try:
    _ort_datas, _ort_bins, _ort_hidden = collect_all('onnxruntime')
    datas += _ort_datas
    binaries += _ort_bins
    hiddenimports += _ort_hidden
except Exception:
    pass

# torch_directml
try:
    _dml_datas, _dml_bins, _dml_hidden = collect_all('torch_directml')
    datas += _dml_datas
    binaries += _dml_bins
    hiddenimports += _dml_hidden
except Exception:
    pass

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports + [
        'pipeline',
        'pipeline.extractor',
        'pipeline.cleaner',
        'pipeline.transcriber',
        'pipeline.aligner',
        'pipeline.exporter',
        'audio_separator',
        'audio_separator.separator',
        'onnxruntime',
        'torch_directml',
        'google.genai',
        'google.generativeai',
        'montreal_forced_aligner',
        'textgrid',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'PIL', 'notebook'],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='subforge-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Console=True para stdio funcionar
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='subforge-x86_64-pc-windows-msvc',
)
