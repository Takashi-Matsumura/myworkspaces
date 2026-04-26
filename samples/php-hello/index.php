<?php

declare(strict_types=1);

class Greeter
{
    private string $name;

    public function __construct(string $name)
    {
        $this->name = $name;
    }

    public function greet(): string
    {
        return "Hello, {$this->name}! (from PHP)";
    }
}

$name = $argv[1] ?? 'World';
$greeter = new Greeter($name);
echo $greeter->greet() . PHP_EOL;
