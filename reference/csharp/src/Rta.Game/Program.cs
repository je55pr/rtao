using Rta.Game;

GameOptions options;
try
{
    options = GameOptions.Parse(args);
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    Console.Error.WriteLine("Usage: Rta.Game --disc <path-to-cue/bin/iso/directory> [--field 223] [--screenshot output.png] [--screenshot-frame n] [--camera x y z] [--yaw radians] [--pitch radians]");
    return 2;
}

using var game = new RtaGame(options);
game.Run();
return 0;
