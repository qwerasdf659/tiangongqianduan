import { defineComponent, h } from 'vue';

export const IconLock = defineComponent({
  name: 'IconLock',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M288 448V352c0-124 100-224 224-224s224 100 224 224v96", "fillRule": "evenodd"})
      ]
    );
  }
});
