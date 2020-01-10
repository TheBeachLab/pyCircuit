#!/usr/bin/env node
//
// frep.js
//    functional representation solver
//
// usage:
//    pcb.py | frep.js [dpi [workers [filename]]]
// with:
//    https://gitlab.cba.mit.edu/pub/libraries/blob/master/python/pcb.py
//
// Neil Gershenfeld 12/7/19
//
// This work may be reproduced, modified, distributed,
// performed, and displayed for any purpose, but must
// acknowledge this project. Copyright is retained and
// must be preserved. The work is provided as is; no
// warranty is provided, and users accept all liability.
//
const fs = require("fs")
const os = require("os")
const {Worker} = require('worker_threads')
//
// get frep from stdin
//
var input = ''
process.stdin.on('readable',() => {
   var chunk = process.stdin.read()
   if (chunk != null)
      input += chunk
   })
process.stdin.on('end',() => {
   render(JSON.parse(input))
   })
//
// render function
//
function render(frep) {
   //
   // check arguments
   //
   if (frep.zmin != frep.zmax) {
      console.log('> 2D not (yet) supported')
      process.exit()
      }
   if (frep.type != 'RGB') {
      console.log('types other than RGB not (yet) supported')
      process.exit()
      }
   if (process.argv.length == 2) {
      var dpi = 100
      workers = os.cpus().length
      var filename = 'out.png'
      console.log('output to out.png at 100 DPI')
      }
   else if (process.argv.length == 3) {
      var dpi = parseInt(process.argv[2])
      workers = os.cpus().length
      var filename = 'out.png'
      console.log('output to out.png at '+dpi+' DPI')
      }
   else if (process.argv.length == 4) {
      var dpi = parseInt(process.argv[2])
      var workers = parseInt(process.argv[3])
      var filename = 'out.png'
      console.log('output to '+filename+' at '+dpi+' DPI')
      }
   else if (process.argv.length == 5) {
      var dpi = parseInt(process.argv[2])
      var workers = parseInt(process.argv[3])
      var filename = process.argv[4]
      console.log('output to '+filename+' at '+dpi+' DPI')
      }
   //
   // set variables
   //
   var delta = (25.4/dpi)/frep.mm_per_unit
   var width = Math.floor(1+(frep.xmax-frep.xmin)/delta)
   var height = Math.floor(1+(frep.ymax-frep.ymin)/delta)
   var buf = new SharedArrayBuffer(width*height*4)
   var data = new Uint8Array(buf)
   //
   // worker thread
   //
   var thread =
      `
      const Worker = require('worker_threads')
      Worker.parentPort.on('message',(msg) => {
         var fn = Function('X','Y','Z','return('+msg.fn+')')
         var data = new Uint8Array(msg.buf)
         var width = msg.width
         var height = msg.height
         var xmin = msg.xmin
         var ymin = msg.ymin
         var delta = msg.delta
         var z = msg.z
         var index = msg.index
         var workers = msg.workers
         var start = Math.round(width*index/workers)
         var stop = Math.round(width*(index+1)/workers)-1
         console.log(index+': '+start+'-'+stop)
         var x,y,f
         for (let row = 0; row < height; ++row) {
            y = ymin+(height-1-row)*delta
            for (let col = start; col <= stop; ++col) {
               x = xmin+col*delta
               f = fn(x,y,z)
               data[row*width*4+col*4+0] = (f & 255)
               data[row*width*4+col*4+1] = ((f >> 8) & 255)
               data[row*width*4+col*4+2] = ((f >> 16) & 255)
               data[row*width*4+col*4+3] = 255
               }
            }
         Worker.parentPort.postMessage(index)
      })
      `
   //
   // start workers
   //
   console.log('start '+workers+' workers')
   var count = 0
   for (let i = 0; i < workers; ++i) {
      var worker = new Worker(thread,{eval:true})
      //
      // worker message handler
      //
      worker.on('message',(msg) => {
         console.log('done: '+msg)
         count += 1
         //
         // check if done
         //
         if (count == workers) {
            var dpm = 1000*dpi/25.4
            fs.writeFileSync(filename,PNG(data,width,height,dpm))
            console.log('wrote '+width+'x'+height)
            process.exit()
            }
         })
      worker.postMessage({index:i,workers:workers,
         delta:delta,width:width,height:height,xmin:frep.xmin,ymin:frep.ymin,
         z:frep.layers[0], // need to handle multiple layers
         buf:buf,fn:frep.function})
      }
   }
//
// PNG function
//
function PNG(array,width,height,dpm) {
   //
   // PNG buffer
   //
   var length =
   8 // signature
   + 25 // IHDR
   + 21 // pHYs
   + 12 // IDAT length, type, CRC
   + 2 // zlib header
   + 4 // zlib checksum
   + 5*(Math.ceil((height+width*height*4)/0xffff)) // block headers
   + width*height*4 // pixels
   + height // scanline filters
   + 12 // IEND
   var buf = new ArrayBuffer(length)
   var arr = new Uint8Array(buf)
   var view = new DataView(buf)
   //
   // checksum functions
   //
   var CRC32table = []
   for (let n = 0; n < 256; ++n) {
      var crc = new Uint32Array(1)
      crc[0] = n
      for (let i = 0; i < 8; ++i) {
         if (crc[0] & 1)
            crc[0] = 0xedb88320 ^ (crc[0] >>> 1)
         else
            crc[0] = crc[0] >>> 1
         }
      CRC32table[n] = crc[0]
      }
   function CRC32(buf,start,stop) {
      var crc = new Uint32Array(1)
      crc[0] = 0xffffffff
      for (let i = start; i < stop; ++i)
         crc[0] = CRC32table[(crc[0] ^ buf[i]) & 0xff] ^ (crc[0] >>> 8);
      crc[0] = crc[0] ^ 0xffffffff
      return(crc[0])
      }
   var CRCAdler32 = new Uint32Array([1,0,0])
   function Adler32(byte,crc) {
      crc[0] = (crc[0]+byte)%65521
      crc[1] = (crc[1]+crc[0])%65521
      crc[2] = (crc[1]<<16)+crc[0]
      return(crc)
      }
   //
   var ptr = 0
   var LengthPtr,DataStart,CRCstart,AdlerStart
   //
   // signature
   //
   arr.set([137,80,78,71,13,10,26,10],ptr)
   ptr += 8
   //
   // IHDR length
   //
   view.setUint32(ptr,13,false)
   ptr += 4
   //
   // IHDR type
   //
   CRCstart = ptr
   arr.set([73,72,68,82],ptr)
   ptr += 4
   //
   // IHDR data
   //
   view.setUint32(ptr,width,false) // width
   ptr += 4
   view.setUint32(ptr,height,false) // height
   ptr += 4
   arr.set([8,6,0,0,0],ptr)// 8 bit depth, RGBA, deflate compression, adaptive filter
   ptr += 5
   //
   // IHDR CRC
   //
   view.setUint32(ptr,CRC32(arr,CRCstart,ptr),false)
   ptr += 4
   //
   // pHYs length
   //
   view.setUint32(ptr,9,false)
   ptr += 4
   //
   // pHYs type
   //
   CRCstart = ptr
   arr.set([112,72,89,115],ptr)
   ptr += 4
   //
   // pHYs data
   //
   view.setUint32(ptr,dpm) // x pixels per unit
   ptr += 4
   view.setUint32(ptr,dpm) // y pixels per unit
   ptr += 4
   view.setUint8(ptr,1) // meter unit
   ptr += 1
   //
   // pHYs CRC
   //
   view.setUint32(ptr,CRC32(arr,CRCstart,ptr),false)
   ptr += 4
   //
   // IDAT length location
   //
   LengthPtr = ptr
   ptr += 4
   //
   // IDAT type
   //
   CRCstart = ptr
   arr.set([73,68,65,84],ptr)
   ptr += 4
   //
   // IDAT data
   //
   // IDAT data zlib header
   //
   DataStart = ptr
   arr.set([0x78,0x01],ptr)
   ptr += 2
   //
   // IDAT data deflate blocks
   //
   var BlockSize = 0xffff
   var BlockByte = 0
   var DataSize = height+width*height*4
   var DataByte = 0
   function BlockData(byte) {
      if (BlockByte == 0) { // start of new block
         if (DataByte+BlockSize < DataSize) {
            var BlockLength = BlockSize
            view.setUint8(ptr,0) // block header, not last block, no compression
            ptr += 1
            }
         else if (DataByte+BlockSize == DataSize) {
            var BlockLength = BlockSize
            view.setUint8(ptr,1) // block header, last block, no compression
            ptr += 1
            }
         else {
            var BlockLength = DataSize-DataByte
            view.setUint8(ptr,1) // block header, last block, no compression
            ptr += 1
            }
         view.setUint16(ptr,BlockLength,true) // block length, little-endian
         ptr += 2
         view.setUint16(ptr,0xffff ^ view.getUint16(ptr-2,true),true) // block length one's complement
         ptr += 2
         }
      CRCAdler32 = Adler32(byte,CRCAdler32) // update zlib checksum
      view.setUint8(ptr,byte) // save byte to PNG buffer
      ptr += 1 // move PNG pointer
      DataByte += 1 // move data counter
      BlockByte += 1 // move block counter
      if (BlockByte == BlockSize) // end of deflate block
         BlockByte = 0 // next byte starts new block
      }
   //
   // IDAT data scan lines
   //
   for (let row = 0; row < height; ++row) {
      BlockData(0) // scan line, no filter
      for (let col = 0; col < width; ++col) {
         BlockData(array[row*width*4+col*4+0]) // R
         BlockData(array[row*width*4+col*4+1]) // G
         BlockData(array[row*width*4+col*4+2]) // B
         BlockData(array[row*width*4+col*4+3]) // A
         }
      }
   //
   // IDAT data zlib checksum
   //
   view.setUint32(ptr,CRCAdler32[2],false) // zlib Adler32
   ptr += 4
   //
   // set IDAT length
   //
   view.setUint32(LengthPtr,ptr-DataStart,false)
   //
   // IDAT CRC
   //
   view.setUint32(ptr,CRC32(arr,CRCstart,ptr),false)
   ptr += 4
   //
   // IEND length
   //
   view.setUint32(ptr,0,false)
   ptr += 4
   //
   // IEND type
   //
   CRCstart = ptr
   arr.set([73,69,78,68],ptr)
   ptr += 4
   //
   // no IEND data
   //
   // IHDR CRC
   //
   view.setUint32(ptr,CRC32(arr,CRCstart,ptr),false)
   ptr += 4
   //
   // return
   //
   return arr
   }
