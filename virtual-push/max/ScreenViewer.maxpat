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
   100.0,
   100.0,
   1020.0,
   330.0
  ],
  "title": "Virtual Push screen",
  "boxes": [
   {
    "box": {
     "id": "lb",
     "maxclass": "newobj",
     "text": "loadbang",
     "numinlets": 1,
     "numoutlets": 1,
     "outlettype": [
      "bang"
     ],
     "patching_rect": [
      320.0,
      10.0,
      60.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "met",
     "maxclass": "newobj",
     "text": "metro 5000",
     "numinlets": 2,
     "numoutlets": 1,
     "outlettype": [
      "bang"
     ],
     "patching_rect": [
      390.0,
      10.0,
      70.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "autocmt",
     "maxclass": "comment",
     "text": "click the message to save a PNG of the current frame",
     "patching_rect": [
      470.0,
      10.0,
      200.0,
      20.0
     ]
    }
   },
   {
    "box": {
     "id": "title",
     "maxclass": "comment",
     "text": "Virtual Push 3 screen: frames from usbfake over TCP (jit.net, port 7474)",
     "patching_rect": [
      20.0,
      10.0,
      500.0,
      20.0
     ]
    }
   },
   {
    "box": {
     "id": "recv",
     "varname": "recv",
     "maxclass": "newobj",
     "text": "jit.net.recv @port 7474",
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "jit_matrix",
      ""
     ],
     "patching_rect": [
      20.0,
      40.0,
      150.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "mtx",
     "varname": "screen",
     "maxclass": "newobj",
     "text": "jit.matrix 4 char 960 160 @name vpush_screen",
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "jit_matrix",
      ""
     ],
     "patching_rect": [
      20.0,
      70.0,
      260.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "win",
     "maxclass": "jit.pwindow",
     "numinlets": 1,
     "numoutlets": 2,
     "outlettype": [
      "",
      ""
     ],
     "patching_rect": [
      20.0,
      100.0,
      960.0,
      160.0
     ]
    }
   },
   {
    "box": {
     "id": "fps",
     "maxclass": "jit.fpsgui",
     "numinlets": 1,
     "numoutlets": 1,
     "outlettype": [
      ""
     ],
     "patching_rect": [
      20.0,
      270.0,
      200.0,
      36.0
     ]
    }
   },
   {
    "box": {
     "id": "snapmsg",
     "varname": "snap",
     "maxclass": "message",
     "text": "exportimage vpush_snapshot.png png",
     "numinlets": 2,
     "numoutlets": 1,
     "outlettype": [
      ""
     ],
     "patching_rect": [
      320.0,
      40.0,
      200.0,
      22.0
     ]
    }
   },
   {
    "box": {
     "id": "snapcmt",
     "maxclass": "comment",
     "text": "writes the current frame as a PNG next to this patch",
     "patching_rect": [
      530.0,
      40.0,
      320.0,
      20.0
     ]
    }
   }
  ],
  "lines": [
   {
    "patchline": {
     "source": [
      "lb",
      0
     ],
     "destination": [
      "met",
      0
     ]
    }
   },
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
      "win",
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
      "fps",
      0
     ]
    }
   },
   {
    "patchline": {
     "source": [
      "snapmsg",
      0
     ],
     "destination": [
      "mtx",
      0
     ]
    }
   }
  ]
 }
}