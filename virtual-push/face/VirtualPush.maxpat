{
 "patcher": {
  "fileversion": 1,
  "appversion": {
   "major": 9,
   "minor": 0,
   "revision": 0,
   "architecture": "x64",
   "modernui": 1
  },
  "classnamespace": "box",
  "rect": [
   80.0,
   80.0,
   1040.0,
   984.0
  ],
  "title": "Virtual Push 3",
  "bglocked": 0,
  "openinpresentation": 0,
  "boxes": [
   {
    "box": {
     "id": "face",
     "maxclass": "v8ui",
     "patching_rect": [
      0,
      0,
      1000,
      834
     ],
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "",
      ""
     ],
     "filename": "vpush.js",
     "varname": "face"
    }
   },
   {
    "box": {
     "id": "recv",
     "maxclass": "newobj",
     "patching_rect": [
      20,
      854,
      150,
      22
     ],
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "jit_matrix",
      ""
     ],
     "text": "jit.net.recv @port 7474",
     "varname": "screen_recv"
    }
   },
   {
    "box": {
     "id": "mtx",
     "maxclass": "newobj",
     "patching_rect": [
      20,
      884,
      260,
      22
     ],
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "jit_matrix",
      ""
     ],
     "text": "jit.matrix 4 char 960 160 @name vpush_screen",
     "varname": "screen_mtx"
    }
   },
   {
    "box": {
     "id": "udpin",
     "maxclass": "newobj",
     "patching_rect": [
      300,
      854,
      110,
      22
     ],
     "numinlets": 1,
     "numoutlets": 1,
     "outlettype": [
      ""
     ],
     "text": "udpreceive 7476"
    }
   },
   {
    "box": {
     "id": "udpout",
     "maxclass": "newobj",
     "patching_rect": [
      300,
      914,
      150,
      22
     ],
     "numinlets": 1,
     "numoutlets": 0,
     "outlettype": [],
     "text": "udpsend 127.0.0.1 7475"
    }
   },
   {
    "box": {
     "id": "mpet",
     "maxclass": "toggle",
     "patching_rect": [
      480,
      854,
      20,
      20
     ],
     "numinlets": 1,
     "numoutlets": 1,
     "outlettype": [
      "int"
     ],
     "varname": "mpe_toggle"
    }
   },
   {
    "box": {
     "id": "mpemsg",
     "maxclass": "message",
     "patching_rect": [
      505,
      854,
      50,
      22
     ],
     "numinlets": 2,
     "numoutlets": 1,
     "outlettype": [
      ""
     ],
     "text": "mpe $1"
    }
   },
   {
    "box": {
     "id": "mpec",
     "maxclass": "comment",
     "patching_rect": [
      560,
      854,
      420,
      20
     ],
     "numinlets": 0,
     "numoutlets": 0,
     "outlettype": [],
     "text": "MPE pads (each pad on its own channel 2-16): only if MPE is enabled in the Push Setup; off = pads on channel 1, what Live expects by default"
    }
   },
   {
    "box": {
     "id": "lb",
     "maxclass": "newobj",
     "patching_rect": [
      480,
      884,
      60,
      22
     ],
     "numinlets": 1,
     "numoutlets": 1,
     "outlettype": [
      "bang"
     ],
     "text": "loadbang"
    }
   },
   {
    "box": {
     "id": "one",
     "maxclass": "message",
     "patching_rect": [
      480,
      914,
      25,
      22
     ],
     "numinlets": 2,
     "numoutlets": 1,
     "outlettype": [
      ""
     ],
     "text": "0"
    }
   },
   {
    "box": {
     "id": "con",
     "maxclass": "comment",
     "patching_rect": [
      600,
      884,
      140,
      20
     ],
     "numinlets": 0,
     "numoutlets": 0,
     "outlettype": [],
     "text": "console (last event)"
    }
   },
   {
    "box": {
     "id": "conm",
     "maxclass": "message",
     "patching_rect": [
      600,
      914,
      380,
      22
     ],
     "numinlets": 2,
     "numoutlets": 1,
     "outlettype": [
      ""
     ]
    }
   },
   {
    "box": {
     "id": "help",
     "maxclass": "comment",
     "patching_rect": [
      20,
      944,
      700,
      20
     ],
     "numinlets": 0,
     "numoutlets": 0,
     "outlettype": [],
     "text": "Virtual Push 3: start run.sh first (pushbridge, Live, the fake Push helper). See face/README.md."
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "recv",
      0
     ],
     "destination": [
      "mtx",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "mtx",
      0
     ],
     "destination": [
      "face",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "udpin",
      0
     ],
     "destination": [
      "face",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "face",
      0
     ],
     "destination": [
      "udpout",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "face",
      1
     ],
     "destination": [
      "conm",
      1
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "mpet",
      0
     ],
     "destination": [
      "mpemsg",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "mpemsg",
      0
     ],
     "destination": [
      "face",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "lb",
      0
     ],
     "destination": [
      "one",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "one",
      0
     ],
     "destination": [
      "mpet",
      0
     ]
    }
   }
  ]
 }
}