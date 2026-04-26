using System;

namespace CsharpHello
{
    class Program
    {
        static void Main(string[] args)
        {
            string name = args.Length > 0 ? args[0] : "World";
            Greeter greeter = new Greeter(name);
            Console.WriteLine(greeter.Greet());
        }
    }

    class Greeter
    {
        private readonly string _name;

        public Greeter(string name)
        {
            _name = name;
        }

        public string Greet()
        {
            return $"Hello, {_name}! (from C#)";
        }
    }
}
