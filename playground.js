var term = require( 'terminal-kit' ).terminal ;

function terminate() {
	term.grabInput( false ) ;
	setTimeout( function() { process.exit() } , 100 ) ;
}

term.grabInput( { mouse: 'button' } ) ;

term.on( 'key' , function( name , matches , data ) {
	console.log( "'key' event:" , name, data ) ;
	if ( name === 'CTRL_C' ) { terminate() ; }
} ) ;

