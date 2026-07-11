function simple( context )
{
	this.init( context );
}

simple.prototype =
{
	context: null,

	points: null,
	snapshot: null,

	init: function( context )
	{
		this.context = context;
		this.context.globalCompositeOperation = 'source-over';
	},

	destroy: function()
	{
	},

	strokeStart: function( mouseX, mouseY )
	{
		this.points = [ { x: mouseX, y: mouseY } ];

		this.snapshot = this.context.getImageData( 0, 0, this.context.canvas.width, this.context.canvas.height );
	},

	stroke: function( mouseX, mouseY )
	{
		this.points.push( { x: mouseX, y: mouseY } );

		this.context.putImageData( this.snapshot, 0, 0 );

		this.context.lineWidth = BRUSH_SIZE;
		this.context.lineCap = BRUSH_SIZE == 1 ? 'butt' : 'round';
		this.context.lineJoin = 'round';
		this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.5 * BRUSH_PRESSURE + ")";

		this.context.beginPath();
		this.context.moveTo( this.points[0].x, this.points[0].y );

		for ( var i = 1, l = this.points.length; i < l; i ++ )
			this.context.lineTo( this.points[i].x, this.points[i].y );

		this.context.stroke();
	},

	strokeEnd: function()
	{
		this.points = null;
		this.snapshot = null;
	}
}
