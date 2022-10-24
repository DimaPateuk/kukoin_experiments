var term = require( 'terminal-kit' ).terminal ;

var fs = require( 'fs' ) ;

term.cyan( 'Choose a file:\n' ) ;

var items = ['sell', 'buy'] ;

term.gridMenu( items , function( error , response ) {
  console.log(response);

	process.exit() ;
} ) ;

setInterval(() => {
  console.clear();
  console.log(1);
}, 10)
