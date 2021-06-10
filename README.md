# vim-o-pelli

Forked from [https://gitlab.cba.mit.edu/pub/libraries/tree/master/python](https://gitlab.cba.mit.edu/pub/libraries/tree/master/python)

Inspired by [kokopelli](https://github.com/mkeeter/kokopelli) 

## WTF is this shit?

TL;DR This is a workflow for generating circuit board images by coding in vim instead of drawing with kiCAD or other software.

## vim key binding

For convenience, I  created a vim keybinding to `F4` for executing some commands while still being in *insert mode*. In vim to execute a command  you have to exit *insert mode* by pressing `ESC` key, then type the command followed by the `enter` key and then entering again *insert mode* by pressing `i`. `F4` save the file and generate a 300 dpi image. Add this to your `.vimrc`:

`inoremap <F4> <C-o>:w<CR><C-o>:silent ! ./trigger.sh<CR><C-o>:redraw!<CR>`

## How it works

The script `trigger.sh` contains:

`python pcb.py | python frep.py 300`

`pcb.py` creates a functional representation of the circuit board and saves it in json format. The ouput is passed to `frep.py` which evaluates the functions and generates an RGB matrix which is saved as an image at 300 dpi (bigger than that becomes too slow).  

view:  
`out.png`

![](img/pcb.png)

optional frep arguments:  
`frep.py dpi`  
`frep.py dpi filename`  

## Usage

Open a `feh` image viewer that reloads every few seconds  
`feh out.png --auto-zoom -R 2 &`

Open `pcb.py` in vim and start editing. When you want to refresh the image press `F4`.  

## Dependencies
  
- Python 3 
- NumPy  
- Python Imaging Library  
- feh image viewer

