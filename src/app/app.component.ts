import { animation } from '@angular/animations';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { animationFrameScheduler, concat, defer, fromEvent, interval, merge, Observable, of } from 'rxjs';
import { 
  first, map, scan, share, startWith, switchMap, takeUntil, takeWhile, withLatestFrom 
} from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('carousel', { static: true }) carousel!: ElementRef;
  @ViewChild('container', { static: true }) container!: ElementRef;

  backgroundColors = ['lightcoral', 'lightcyan', 'lightgreen', 'lightskyblue', 'lightseagreen'];

  ngOnInit(): void {
    const { nativeElement } = this.carousel;

    // DOM 이벤트를 Observable로 변환
    const start$: Observable<MouseEvent> = fromEvent(nativeElement, 'mousedown');
    const move$: Observable<MouseEvent> = fromEvent(nativeElement, 'mousemove');
    const end$: Observable<MouseEvent> = fromEvent(nativeElement, 'mouseup');
    const size$: Observable<number> = fromEvent(window, 'resize')
      .pipe(
        startWith(0),
        map(_event => (nativeElement as HTMLDivElement).clientWidth),
      );

    // 마우스 위치에 대한 Observable로 변환
    const startPos$ = start$.pipe(
      map(event => event.pageX),
    );
    const movePos$ = move$.pipe(
      map(event => event.pageX),
    );

    // startPos$을 movePos$로 변환하고, 새로운 drag$을 생성하여 반환
    const drag$ = startPos$.pipe(
      switchMap(startPosition => {
        return movePos$.pipe(
          map(movePosition => movePosition - startPosition),
          map(distance => ({ distance, size: null })),
          takeUntil(end$),
        );
      }),
      share(),
    );

    // 새로운 drag$ 옵저버블이 생성되면, 앞선 옵저버블에 대한 구독을 해제
    const drop$ = drag$.pipe(
      switchMap(distance => {
        return end$.pipe(
          map(_event => distance),
          first(),
        );
      }),
      // size$에서 가장 최근에 방출된 데이터를 가공하여 반환
      withLatestFrom(size$, (drag, size) => {
        return { ...drag, size };
      }),
    );

    // scan 오퍼레이터를 사용한 상태 관리
    const carousel$ = merge(drag$, drop$)
      .pipe(
        scan((store, {distance, size}) => {
          const updateStore = {
            ...store,
            from: -(store.index * store.size) + distance,
          };

          // drag 시점
          if (size === null) {
            updateStore.to = updateStore.from; 
          }
          // drop 시점
          else {
            let toBeIndex = store.index;

            if (Math.abs(distance) >= 30) {
              toBeIndex = distance < 0
                ? Math.min(toBeIndex + 1, this.backgroundColors.length - 1)
                : Math.max(toBeIndex - 1, 0);
            }

            updateStore.index = toBeIndex;
            updateStore.to = -(toBeIndex * size);
            updateStore.size = size;
          }

          return { ...store, ...updateStore };
        }, {
          from: 0,
          to: 0,
          index: 0,
          size: 0,
        }),
        switchMap(({ from ,to }) => {
          return from === to
            ? of(to)
            : this.generateAnimation(from, to, 300);
        }),
      );
    
    carousel$.subscribe(position => {
      const containerElem = this.container.nativeElement as HTMLUListElement;

      containerElem.style.transform = `translateX(${position}px)`;
    });
  }

  private generateAnimation(from: number, to: number, duration: number): Observable<number> {
    return defer(() => {
      const scheduler = animationFrameScheduler;
      const startTime = scheduler.now();
      const interval$ = interval(0, scheduler)
        .pipe(
          map(() => (scheduler.now() - startTime) / duration),
          takeWhile(rate => rate < 1),
        );

      return concat(interval$, of(1))
        .pipe(
          map(rate => from + (to - from) * rate),
        );
    });
  }
}
